import { OP_DEFI_TX, OPCode } from '@defichain/jellyfish-transaction'
import { Indexer, RawBlock } from '@src/module.indexer/model/_abstract'
import { toOPCodes } from '@defichain/jellyfish-transaction/dist/script/_buffer'
import { SmartBuffer } from 'smart-buffer'
import { AppointOracleIndexer } from '@src/module.indexer/model/dftx/appoint.oracle'
import { RemoveOracleIndexer } from '@src/module.indexer/model/dftx/remove.oracle'
import { UpdateOracleIndexer } from '@src/module.indexer/model/dftx/update.oracle'
import { SetOracleDataIndexer } from '@src/module.indexer/model/dftx/set.oracle.data'
import { SetOracleDataIntervalIndexer } from '@src/module.indexer/model/dftx/set.oracle.data.interval'
import { CreateMasternodeIndexer } from '@src/module.indexer/model/dftx/create.masternode'
import { ResignMasternodeIndexer } from '@src/module.indexer/model/dftx/resign.masternode'
import { Injectable, Logger } from '@nestjs/common'
import { DfTxIndexer, DfTxTransaction } from '@src/module.indexer/model/dftx/_abstract'
import { CreatePoolPairIndexer } from './dftx/create.poolpair'
import { CreateTokenIndexer } from './dftx/create.token'
import { PoolAddLiquidityIndexer } from './dftx/pool.add.liquidity'
import { PoolRemoveLiquidityIndexer } from './dftx/pool.remove.liquidity'
import { PoolSwapIndexer } from './dftx/poolswap'
import { UpdatePoolPairIndexer } from './dftx/update.poolpair'
import { CompositeSwapIndexer } from './dftx/compositeswap'

@Injectable()
export class MainDfTxIndexer extends Indexer {
  private readonly logger = new Logger(MainDfTxIndexer.name)
  private readonly indexers: Array<DfTxIndexer<any>>

  constructor (
    appointOracle: AppointOracleIndexer,
    removeOracle: RemoveOracleIndexer,
    updateOracle: UpdateOracleIndexer,
    setOracleData: SetOracleDataIndexer,
    setOracleDataInterval: SetOracleDataIntervalIndexer,
    createMasternode: CreateMasternodeIndexer,
    resignMasternode: ResignMasternodeIndexer,
    createToken: CreateTokenIndexer,
    createPoolPair: CreatePoolPairIndexer,
    updatePoolPair: UpdatePoolPairIndexer,
    poolAddLiquidityIndexer: PoolAddLiquidityIndexer,
    poolRemoveLiquidityIndexer: PoolRemoveLiquidityIndexer,
    poolSwapIndexer: PoolSwapIndexer,
    compositeSwapIndexer: CompositeSwapIndexer
  ) {
    super()
    this.indexers = [
      appointOracle,
      updateOracle,
      removeOracle,
      setOracleData,
      createMasternode,
      resignMasternode,
      setOracleDataInterval,
      createToken,
      createPoolPair,
      updatePoolPair,
      poolAddLiquidityIndexer,
      poolRemoveLiquidityIndexer,
      poolSwapIndexer,
      compositeSwapIndexer
    ]
  }

  async index (block: RawBlock): Promise<void> {
    const transactions = this.getDfTxTransactions(block)

    for (const indexer of this.indexers) {
      const filtered = transactions.filter(value => value.dftx.type === indexer.OP_CODE)
      await indexer.index(block, filtered)
    }
  }

  async invalidate (block: RawBlock): Promise<void> {
    const transactions = this.getDfTxTransactions(block)

    for (const indexer of this.indexers) {
      const filtered = transactions.filter(value => value.dftx.type === indexer.OP_CODE)
      await indexer.invalidate(block, filtered)
    }
  }

  private getDfTxTransactions (block: RawBlock): Array<DfTxTransaction<any>> {
    const transactions: Array<DfTxTransaction<any>> = []

    for (const txn of block.tx) {
      for (const vout of txn.vout) {
        if (!vout.scriptPubKey.asm.startsWith('OP_RETURN 44665478')) {
          continue
        }

        try {
          const stack: OPCode[] = toOPCodes(SmartBuffer.fromBuffer(Buffer.from(vout.scriptPubKey.hex, 'hex')))
          if (stack[1].type !== 'OP_DEFI_TX') {
            continue
          }
          transactions.push({ txn: txn, dftx: (stack[1] as OP_DEFI_TX).tx })
        } catch (err) {
          // TODO(fuxingloh): we can improve on this design by having separated indexing pipeline where
          //  a failed pipeline won't affect another indexer pipeline.
          this.logger.error(`Failed to parse a DfTx Transaction with txid: ${txn.txid}`, err)
        }
      }
    }

    return transactions
  }
}
