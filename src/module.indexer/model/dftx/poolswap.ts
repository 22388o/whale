import { DfTxIndexer, DfTxTransaction } from '@src/module.indexer/model/dftx/_abstract'
import { PoolSwap, CPoolSwap } from '@defichain/jellyfish-transaction'
import { RawBlock } from '@src/module.indexer/model/_abstract'
import { Inject, Injectable } from '@nestjs/common'
import { PoolPairHistoryMapper, PoolPairHistory } from '@src/module.model/pool.pair.history'
import { PoolPairTokenMapper } from '@src/module.model/pool.pair.token'
import { NetworkName } from '@defichain/jellyfish-network'
import { IndexerError } from '@src/module.indexer/error'
import BigNumber from 'bignumber.js'
import { PoolSwapMapper } from '@src/module.model/poolswap'
import { HexEncoder } from '@src/module.model/_hex.encoder'

@Injectable()
export class PoolSwapIndexer extends DfTxIndexer<PoolSwap> {
  OP_CODE: number = CPoolSwap.OP_CODE

  constructor (
    private readonly poolPairMapper: PoolPairHistoryMapper,
    private readonly poolPairTokenMapper: PoolPairTokenMapper,
    private readonly poolSwapMapper: PoolSwapMapper,
    @Inject('NETWORK') protected readonly network: NetworkName
  ) {
    super()
  }

  async indexTransaction (block: RawBlock, transaction: DfTxTransaction<PoolSwap>): Promise<void> {
    const data = transaction.dftx.data

    const poolPairToken = await this.poolPairTokenMapper.getPair(data.fromTokenId, data.toTokenId)
    if (poolPairToken === undefined) {
      throw new IndexerError(`Pool for pair ${data.fromTokenId}, ${data.toTokenId} not found`)
    }

    const poolPair = await this.poolPairMapper.getLatest(`${poolPairToken.poolPairId}`)
    if (poolPair !== undefined) {
      await this.indexSwap(poolPair, data.fromTokenId, data.fromAmount, block,
        transaction.txn.txid, transaction.txnNo)
    }
  }

  async indexSwap (poolPair: PoolPairHistory, fromTokenId: number, fromAmount: BigNumber, block: RawBlock,
    txid: string, txnNo: number): Promise<void> {
    await this.poolSwapMapper.put({
      id: `${poolPair.poolPairId}-${txid}`,
      key: poolPair.poolPairId,
      sort: HexEncoder.encodeHeight(block.height) + HexEncoder.encodeHeight(txnNo),
      poolPairId: poolPair.poolPairId,
      fromAmount: fromAmount.toFixed(8),
      fromTokenId: fromTokenId,
      block: {
        hash: block.hash,
        height: block.height,
        time: block.time,
        medianTime: block.mediantime
      }
    })
  }

  async invalidateSwap (poolPairId: string, txid: string): Promise<void> {
    await this.poolSwapMapper.delete(`${poolPairId}-${txid}`)
  }

  async invalidateTransaction (block: RawBlock, transaction: DfTxTransaction<PoolSwap>): Promise<void> {
    const data = transaction.dftx.data
    const poolPairToken = await this.poolPairTokenMapper.getPair(data.fromTokenId, data.toTokenId)

    if (poolPairToken === undefined) {
      throw new IndexerError(`Pool for pair ${data.fromTokenId}, ${data.toTokenId} not found`)
    }

    const poolPair = await this.poolPairMapper.getLatest(`${poolPairToken.poolPairId}`)
    if (poolPair === undefined) {
      throw new IndexerError(`Pool with id ${poolPairToken.poolPairId} not found`)
    }

    await this.invalidateSwap(poolPair.poolPairId, transaction.txn.txid)
  }
}
