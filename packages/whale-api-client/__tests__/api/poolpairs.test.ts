import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { StubWhaleApiClient } from '../stub.client'
import { StubService } from '../stub.service'
import { ApiPagedResponse, WhaleApiClient, WhaleApiException } from '../../src'
import { addPoolLiquidity, createPoolPair, createToken, getNewAddress, mintTokens, poolSwap } from '@defichain/testing'
import { PoolPairData, PoolSwap } from '../../src/api/poolpairs'
import { Testing } from '@defichain/jellyfish-testing'

let container: MasterNodeRegTestContainer
let service: StubService
let client: WhaleApiClient
let testing: Testing

beforeEach(async () => {
  container = new MasterNodeRegTestContainer()
  service = new StubService(container)
  client = new StubWhaleApiClient(service)
  testing = Testing.create(container)

  await container.start()
  await container.waitForWalletCoinbaseMaturity()
  await service.start()

  await setup()
})

afterEach(async () => {
  try {
    await service.stop()
  } finally {
    await container.stop()
  }
})

async function setup (): Promise<void> {
  const tokens = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

  for (const token of tokens) {
    await container.waitForWalletBalanceGTE(110)
    await createToken(container, token, {
      collateralAddress: await testing.address('swap')
    })
    await mintTokens(container, token, {
      mintAmount: 10000
    })
  }
  await createPoolPair(container, 'A', 'DFI')
  await createPoolPair(container, 'B', 'DFI')
  await createPoolPair(container, 'C', 'DFI')
  await createPoolPair(container, 'D', 'DFI')
  await createPoolPair(container, 'E', 'DFI')
  await createPoolPair(container, 'F', 'DFI')
  await createPoolPair(container, 'G', 'DFI')
  await createPoolPair(container, 'H', 'DFI')

  await addPoolLiquidity(container, {
    tokenA: 'A',
    amountA: 100,
    tokenB: 'DFI',
    amountB: 200,
    shareAddress: await getNewAddress(container)
  })
  await addPoolLiquidity(container, {
    tokenA: 'B',
    amountA: 50,
    tokenB: 'DFI',
    amountB: 300,
    shareAddress: await getNewAddress(container)
  })
  await addPoolLiquidity(container, {
    tokenA: 'C',
    amountA: 90,
    tokenB: 'DFI',
    amountB: 360,
    shareAddress: await getNewAddress(container)
  })

  // dexUsdtDfi setup
  await createToken(container, 'USDT')
  await createPoolPair(container, 'USDT', 'DFI')
  await mintTokens(container, 'USDT')
  await addPoolLiquidity(container, {
    tokenA: 'USDT',
    amountA: 1000,
    tokenB: 'DFI',
    amountB: 431.51288,
    shareAddress: await getNewAddress(container)
  })

  await createToken(container, 'USDC')
  await createPoolPair(container, 'USDC', 'H')
  await mintTokens(container, 'USDC')
  await addPoolLiquidity(container, {
    tokenA: 'USDC',
    amountA: 500,
    tokenB: 'H',
    amountB: 31.51288,
    shareAddress: await getNewAddress(container)
  })

  await createToken(container, 'DUSD')
  await createToken(container, 'TSLA', {
    collateralAddress: await testing.address('swap')
  })
  await createPoolPair(container, 'TSLA', 'DUSD', {
    commission: 0.002
  })
  await mintTokens(container, 'DUSD')
  await mintTokens(container, 'TSLA')
  await addPoolLiquidity(container, {
    tokenA: 'TSLA',
    amountA: 20,
    tokenB: 'DUSD',
    amountB: 100,
    shareAddress: await getNewAddress(container)
  })
}

describe('poolpair info', () => {
  it('should list', async () => {
    const response: ApiPagedResponse<PoolPairData> = await client.poolpairs.list(30)

    expect(response.length).toStrictEqual(11)
    expect(response.hasNext).toStrictEqual(false)

    expect(response[1]).toStrictEqual({
      id: '10',
      symbol: 'B-DFI',
      displaySymbol: 'dB-DFI',
      name: 'B-Default Defi token',
      status: true,
      tokenA: {
        id: '2',
        symbol: 'B',
        reserve: '50',
        blockCommission: '0',
        displaySymbol: 'dB'
      },
      tokenB: {
        id: '0',
        symbol: 'DFI',
        reserve: '300',
        blockCommission: '0',
        displaySymbol: 'DFI'
      },
      apr: {
        reward: 0,
        total: 0,
        commission: 0
      },
      commission: '0',
      totalLiquidity: {
        token: '122.47448713',
        usd: '1390.4567576291117892'
      },
      tradeEnabled: true,
      ownerAddress: expect.any(String),
      priceRatio: {
        ab: '0.16666666',
        ba: '6'
      },
      rewardPct: '0',
      creation: {
        tx: expect.any(String),
        height: expect.any(Number)
      },
      volume: {
        h24: 0
      }
    })
  })

  it('should list with pagination', async () => {
    const first = await client.poolpairs.list(4)
    expect(first.length).toStrictEqual(4)
    expect(first.hasNext).toStrictEqual(true)
    expect(first.nextToken).toStrictEqual('12')

    expect(first[0].symbol).toStrictEqual('A-DFI')
    expect(first[1].symbol).toStrictEqual('B-DFI')
    expect(first[2].symbol).toStrictEqual('C-DFI')
    expect(first[3].symbol).toStrictEqual('D-DFI')

    const next = await client.paginate(first)
    expect(next.length).toStrictEqual(4)
    expect(next.hasNext).toStrictEqual(true)
    expect(next.nextToken).toStrictEqual('16')

    expect(next[0].symbol).toStrictEqual('E-DFI')
    expect(next[1].symbol).toStrictEqual('F-DFI')
    expect(next[2].symbol).toStrictEqual('G-DFI')
    expect(next[3].symbol).toStrictEqual('H-DFI')

    const last = await client.paginate(next)
    expect(last.length).toStrictEqual(3)
    expect(last.hasNext).toStrictEqual(false)
    expect(last.nextToken).toBeUndefined()

    expect(last[0].symbol).toStrictEqual('USDT-DFI')
    expect(last[1].symbol).toStrictEqual('USDC-H')
  })

  it('should get 9', async () => {
    const response: PoolPairData = await client.poolpairs.get('9')

    expect(response).toStrictEqual({
      id: '9',
      symbol: 'A-DFI',
      displaySymbol: 'dA-DFI',
      name: 'A-Default Defi token',
      status: true,
      tokenA: {
        id: expect.any(String),
        symbol: 'A',
        reserve: '100',
        blockCommission: '0',
        displaySymbol: 'dA'
      },
      tokenB: {
        id: '0',
        symbol: 'DFI',
        reserve: '200',
        blockCommission: '0',
        displaySymbol: 'DFI'
      },
      apr: {
        reward: 0,
        total: 0,
        commission: 0
      },
      commission: '0',
      totalLiquidity: {
        token: '141.42135623',
        usd: '926.9711717527411928'
      },
      tradeEnabled: true,
      ownerAddress: expect.any(String),
      priceRatio: {
        ab: '0.5',
        ba: '2'
      },
      rewardPct: '0',
      creation: {
        tx: expect.any(String),
        height: expect.any(Number)
      },
      volume: {
        h24: 0
      }
    })
  })

  it('should get 20', async () => {
    const response: PoolPairData = await client.poolpairs.get('20')

    expect(response).toStrictEqual({
      id: '20',
      symbol: 'USDC-H',
      name: 'USDC-H',
      displaySymbol: 'dUSDC-dH',
      status: true,
      tokenA: {
        id: expect.any(String),
        symbol: 'USDC',
        reserve: '500',
        blockCommission: '0',
        displaySymbol: 'dUSDC'
      },
      tokenB: {
        id: '8',
        symbol: 'H',
        reserve: '31.51288',
        blockCommission: '0',
        displaySymbol: 'dH'
      },
      apr: {
        reward: 0,
        total: 0,
        commission: 0
      },
      commission: '0',
      totalLiquidity: {
        token: '125.52465893',
        usd: '1000'
      },
      tradeEnabled: true,
      ownerAddress: expect.any(String),
      priceRatio: {
        ab: '15.86652822',
        ba: '0.06302576'
      },
      rewardPct: '0',
      creation: {
        tx: expect.any(String),
        height: expect.any(Number)
      },
      volume: {
        h24: 0
      }
    })
  })

  it('should throw error as numeric string is expected', async () => {
    expect.assertions(2)
    try {
      await client.poolpairs.get('A-DFI')
    } catch (err) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 400,
        type: 'BadRequest',
        at: expect.any(Number),
        message: 'Validation failed (numeric string is expected)',
        url: '/v0.0/regtest/poolpairs/A-DFI'
      })
    }
  })

  it('should throw error while getting non-existent poolpair', async () => {
    expect.assertions(2)
    try {
      await client.poolpairs.get('999')
    } catch (err) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Unable to find poolpair',
        url: '/v0.0/regtest/poolpairs/999'
      })
    }
  })
})

describe('poolswap', () => {
  it('should show volume and swaps', async () => {
    await poolSwap(container, {
      from: await testing.address('swap'),
      tokenFrom: 'A',
      amountFrom: 25,
      to: await testing.address('swap'),
      tokenTo: 'DFI'
    })

    await poolSwap(container, {
      from: await testing.address('swap'),
      tokenFrom: 'A',
      amountFrom: 50,
      to: await testing.address('swap'),
      tokenTo: 'DFI'
    })

    await poolSwap(container, {
      from: await testing.address('swap'),
      tokenFrom: 'TSLA',
      amountFrom: 10,
      to: await testing.address('swap'),
      tokenTo: 'DUSD'
    })

    const height = await container.getBlockCount()
    await container.generate(1)
    await service.waitForIndexedHeight(height)

    const response: ApiPagedResponse<PoolSwap> = await client.poolpairs.listPoolSwaps('9')
    expect(response.length).toStrictEqual(2)
    expect(response.hasNext).toStrictEqual(false)
    expect(response[0].fromAmount).toStrictEqual('50.00000000')
    expect(response[1].fromAmount).toStrictEqual('25.00000000')
    expect(response[0].fromTokenId).toStrictEqual(1)
    expect(response[1].fromTokenId).toStrictEqual(1)

    const poolPair: PoolPairData = await client.poolpairs.get('9')
    expect(poolPair).toStrictEqual({
      id: '9',
      symbol: 'A-DFI',
      displaySymbol: 'dA-DFI',
      name: 'A-Default Defi token',
      status: true,
      tokenA: {
        id: expect.any(String),
        symbol: 'A',
        reserve: '175',
        blockCommission: '0',
        displaySymbol: 'dA'
      },
      tokenB: {
        id: '0',
        symbol: 'DFI',
        reserve: '114.28571428',
        blockCommission: '0',
        displaySymbol: 'DFI'
      },
      apr: {
        reward: 0,
        total: 0,
        commission: 0
      },
      commission: '0',
      totalLiquidity: {
        token: '141.42135623',
        usd: '529.69781240365293383563596592'
      },
      tradeEnabled: true,
      ownerAddress: expect.any(String),
      priceRatio: {
        ab: '1.53125',
        ba: '0.65306122'
      },
      rewardPct: '0',
      creation: {
        tx: expect.any(String),
        height: expect.any(Number)
      },
      volume: {
        h24: 113.50667408649706
      }
    })

    const dusdPoolPair: PoolPairData = await client.poolpairs.get('23')
    expect(dusdPoolPair).toStrictEqual({
      id: '23',
      symbol: 'TSLA-DUSD',
      displaySymbol: 'dTSLA-DUSD',
      name: 'TSLA-DUSD',
      status: true,
      tokenA: {
        id: expect.any(String),
        symbol: 'TSLA',
        reserve: '29.98',
        blockCommission: '0',
        displaySymbol: 'dTSLA'
      },
      tokenB: {
        id: expect.any(String),
        symbol: 'DUSD',
        reserve: '66.71114076',
        blockCommission: '0',
        displaySymbol: 'DUSD'
      },
      apr: {
        reward: 0,
        total: 0.12174783188792529,
        commission: 0.12174783188792529
      },
      commission: '0.002',
      totalLiquidity: {
        token: '44.72135954',
        usd: '133.42228152'
      },
      tradeEnabled: true,
      ownerAddress: expect.any(String),
      priceRatio: {
        ab: '0.4494002',
        ba: '2.22518815'
      },
      rewardPct: '0',
      creation: {
        tx: expect.any(String),
        height: expect.any(Number)
      },
      volume: {
        h24: 22.251881507671783
      }
    })
  })
})
