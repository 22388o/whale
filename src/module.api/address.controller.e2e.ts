import { AddressController } from '@src/module.api/address.controller'
import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { createTestingApp, stopTestingApp, waitForAddressTxCount, waitForIndexedHeight } from '@src/e2e.module'
import { createSignedTxnHex } from '@defichain/testing'
import { WIF } from '@defichain/jellyfish-crypto'

const container = new MasterNodeRegTestContainer()
let app: NestFastifyApplication
let controller: AddressController

beforeAll(async () => {
  await container.start()
  await container.waitForReady()
  await container.waitForWalletCoinbaseMaturity()
  await container.waitForWalletBalanceGTE(100)

  app = await createTestingApp(container)
  controller = app.get(AddressController)

  await waitForIndexedHeight(app, 100)
})

afterAll(async () => {
  await stopTestingApp(container, app)
})

describe('balance', () => {
  it('getBalance should be zero', async () => {
    const address = await container.getNewAddress()
    const balance = await controller.getBalance('regtest', address)
    expect(balance).toBe('0.00000000')
  })

  it('should getBalance non zero with bech32 address', async () => {
    const address = 'bcrt1qf5v8n3kfe6v5mharuvj0qnr7g74xnu9leut39r'

    await container.fundAddress(address, 1.23)
    await waitForAddressTxCount(app, address, 1)

    const balance = await controller.getBalance('regtest', address)
    expect(balance).toBe('1.23000000')
  })

  it('should getBalance non zero with legacy address', async () => {
    const address = await container.getNewAddress('', 'legacy')

    await container.fundAddress(address, 0.00100000)
    await waitForAddressTxCount(app, address, 1)

    const balance = await controller.getBalance('regtest', address)
    expect(balance).toBe('0.00100000')
  })

  it('should getBalance non zero with p2sh-segwit address', async () => {
    const address = await container.getNewAddress('', 'p2sh-segwit')

    await container.fundAddress(address, 10.99999999)
    await waitForAddressTxCount(app, address, 1)

    const balance = await controller.getBalance('regtest', address)
    expect(balance).toBe('10.99999999')
  })

  it('should sum getBalance', async () => {
    const address = await container.getNewAddress()

    await container.fundAddress(address, 0.12340001)
    await container.fundAddress(address, 4.32412313)
    await container.fundAddress(address, 12.93719381)
    await waitForAddressTxCount(app, address, 3)

    const balance = await controller.getBalance('regtest', address)
    expect(balance).toBe('17.38471695')
  })
})

describe('aggregation', () => {
  it('should aggregate 3 txn', async () => {
    const address = 'bcrt1qxvvp3tz5u8t90nwwjzsalha66zk9em95tgn3fk'

    await container.fundAddress(address, 0.12340001)
    await container.fundAddress(address, 4.32412313)
    await container.fundAddress(address, 12.93719381)
    await waitForAddressTxCount(app, address, 3)

    const agg = await controller.getAggregation('regtest', address)
    expect(agg).toEqual({
      amount: {
        txIn: '17.38471695',
        txOut: '0.00000000',
        unspent: '17.38471695'
      },
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number)
      },
      hid: expect.stringMatching(/[0-f]{64}/),
      id: expect.stringMatching(/[0-f]{72}/),
      script: {
        hex: '0014331818ac54e1d657cdce90a1dfdfbad0ac5cecb4',
        type: 'witness_v0_keyhash'
      },
      statistic: {
        txCount: 3,
        txInCount: 3,
        txOutCount: 0
      }
    })
  })
})

describe('transactions', () => {
  const addressA = {
    bech32: 'bcrt1qykj5fsrne09yazx4n72ue4fwtpx8u65zac9zhn',
    privKey: 'cQSsfYvYkK5tx3u1ByK2ywTTc9xJrREc1dd67ZrJqJUEMwgktPWN'
  }
  const addressB = {
    bech32: 'bcrt1qf26rj8895uewxcfeuukhng5wqxmmpqp555z5a7',
    privKey: 'cQbfHFbdJNhg3UGaBczir2m5D4hiFRVRKgoU8GJoxmu2gEhzqHtV'
  }
  const options = {
    aEllipticPair: WIF.asEllipticPair(addressA.privKey),
    bEllipticPair: WIF.asEllipticPair(addressB.privKey)
  }

  beforeAll(async () => {
    await container.waitForWalletBalanceGTE(100)
    await container.fundAddress(addressA.bech32, 34)
    await container.fundAddress(addressA.bech32, 0.12340001)
    await container.fundAddress(addressA.bech32, 1.32412313)
    await container.fundAddress(addressA.bech32, 2.93719381)

    await container.call('sendrawtransaction', [
      // This create vin & vout with 9.5
      await createSignedTxnHex(container, 9.5, 9.4999, options)
    ])
    await container.call('sendrawtransaction', [
      // This create vin & vout with 1.123
      await createSignedTxnHex(container, 1.123, 1.1228, options)
    ])
    await container.generate(1)
    await waitForAddressTxCount(app, addressB.bech32, 2)
  })

  describe('listTransaction addressA', () => {
    it('should listTransaction', async () => {
      const response = await controller.listTransaction('regtest', addressA.bech32, {
        size: 30
      })

      expect(response.data.length).toBe(8)
      expect(response.page).toBeUndefined()

      expect(response.data[5]).toEqual({
        block: {
          hash: expect.stringMatching(/[0-f]{64}/),
          height: expect.any(Number)
        },
        hid: expect.stringMatching(/[0-f]{64}/),
        id: expect.stringMatching(/[0-f]{72}/),
        script: {
          hex: '001425a544c073cbca4e88d59f95ccd52e584c7e6a82',
          type: 'witness_v0_keyhash'
        },
        tokenId: 0,
        txid: expect.stringMatching(/[0-f]{64}/),
        type: 'vout',
        typeHex: '01',
        value: '1.32412313',
        vout: {
          n: expect.any(Number),
          txid: expect.stringMatching(/[0-f]{64}/)
        }
      })
    })

    it('should listTransaction with pagination', async () => {
      const first = await controller.listTransaction('regtest', addressA.bech32, {
        size: 2
      })
      expect(first.data.length).toBe(2)
      expect(first.page?.next).toMatch(/[0-f]{82}/)
      expect(first.data[0].value).toBe('1.12300000')
      expect(first.data[0].type).toBe('vin')
      expect(first.data[1].value).toBe('1.12300000')
      expect(first.data[1].type).toBe('vout')

      const next = await controller.listTransaction('regtest', addressA.bech32, {
        size: 10,
        next: first.page?.next
      })

      expect(next.data.length).toBe(6)
      expect(next.page?.next).toBeUndefined()
      expect(next.data[0].value).toBe('9.50000000')
      expect(next.data[0].type).toBe('vin')
      expect(next.data[1].value).toBe('9.50000000')
      expect(next.data[1].type).toBe('vout')
      expect(next.data[2].value).toBe('2.93719381')
      expect(next.data[2].type).toBe('vout')
      expect(next.data[3].value).toBe('1.32412313')
      expect(next.data[3].type).toBe('vout')
      expect(next.data[4].value).toBe('0.12340001')
      expect(next.data[4].type).toBe('vout')
      expect(next.data[5].value).toBe('34.00000000')
      expect(next.data[5].type).toBe('vout')
    })

    it('should listTransaction with undefined next pagination', async () => {
      const first = await controller.listTransaction('regtest', addressA.bech32, {
        size: 2,
        next: undefined
      })

      expect(first.data.length).toBe(2)
      expect(first.page?.next).toMatch(/[0-f]{82}/)
    })
  })

  describe('listTransactionUnspent addressA', () => {
    it('should listTransactionUnspent', async () => {
      const response = await controller.listTransactionUnspent('regtest', addressA.bech32, {
        size: 30
      })

      expect(response.data.length).toBe(4)
      expect(response.page).toBeUndefined()

      expect(response.data[3]).toEqual({
        block: {
          hash: expect.stringMatching(/[0-f]{64}/),
          height: expect.any(Number)
        },
        hid: expect.stringMatching(/[0-f]{64}/),
        id: expect.stringMatching(/[0-f]{72}/),
        script: {
          hex: '001425a544c073cbca4e88d59f95ccd52e584c7e6a82',
          type: 'witness_v0_keyhash'
        },
        sort: expect.stringMatching(/[0-f]{80}/),
        vout: {
          n: expect.any(Number),
          tokenId: 0,
          txid: expect.stringMatching(/[0-f]{64}/),
          value: '2.93719381'
        }
      })
    })

    it('should listTransactionUnspent with pagination', async () => {
      const first = await controller.listTransactionUnspent('regtest', addressA.bech32, {
        size: 2
      })
      expect(first.data.length).toBe(2)
      expect(first.page?.next).toMatch(/[0-f]{72}/)
      expect(first.data[0].vout.value).toBe('34.00000000')
      expect(first.data[1].vout.value).toBe('0.12340001')

      const next = await controller.listTransactionUnspent('regtest', addressA.bech32, {
        size: 10,
        next: first.page?.next
      })

      expect(next.data.length).toBe(2)
      expect(next.page?.next).toBeUndefined()
      expect(next.data[0].vout.value).toBe('1.32412313')
      expect(next.data[1].vout.value).toBe('2.93719381')
    })

    it('should listTransactionUnspent with undefined next pagination', async () => {
      const first = await controller.listTransactionUnspent('regtest', addressA.bech32, {
        size: 2,
        next: undefined
      })

      expect(first.data.length).toBe(2)
      expect(first.page?.next).toMatch(/[0-f]{72}/)
    })
  })

  describe('listTransaction addressB', () => {
    it('should listTransaction', async () => {
      const response = await controller.listTransaction('regtest', addressB.bech32, {
        size: 30
      })

      expect(response.data.length).toBe(2)
      expect(response.page).toBeUndefined()

      expect(response.data[1]).toEqual({
        block: {
          hash: expect.stringMatching(/[0-f]{64}/),
          height: expect.any(Number)
        },
        hid: expect.stringMatching(/[0-f]{64}/),
        id: expect.stringMatching(/[0-f]{72}/),
        script: {
          hex: '00144ab4391ce5a732e36139e72d79a28e01b7b08034',
          type: 'witness_v0_keyhash'
        },
        tokenId: 0,
        txid: expect.stringMatching(/[0-f]{64}/),
        type: 'vout',
        typeHex: '01',
        value: '9.49990000',
        vout: {
          n: 0,
          txid: expect.stringMatching(/[0-f]{64}/)
        }
      })
    })
  })

  describe('listTransactionUnspent addressB', () => {
    it('should listTransactionUnspent', async () => {
      const response = await controller.listTransactionUnspent('regtest', addressB.bech32, {
        size: 30
      })

      expect(response.data.length).toBe(2)
      expect(response.page).toBeUndefined()

      expect(response.data[1]).toEqual({
        block: {
          hash: expect.stringMatching(/[0-f]{64}/),
          height: expect.any(Number)
        },
        hid: expect.stringMatching(/[0-f]{64}/),
        id: expect.stringMatching(/[0-f]{72}/),
        script: {
          hex: '00144ab4391ce5a732e36139e72d79a28e01b7b08034',
          type: 'witness_v0_keyhash'
        },
        sort: expect.stringMatching(/[0-f]{80}/),
        vout: {
          n: expect.any(Number),
          tokenId: 0,
          txid: expect.stringMatching(/[0-f]{64}/),
          value: '1.12280000'
        }
      })
    })
  })
})
