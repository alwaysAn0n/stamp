<template>
  <q-card
    style="width: 500px"
    class="q-px-sm q-pb-md"
  >
    <q-card-section>
      <div class="text-h6">Send to Address</div>
    </q-card-section>
    <q-card-section>
      <q-input
        class="text-bold text-h6"
        v-model="address"
        filled
        dense
        placeholder="Enter Bitcoin Cash address..."
      />
    </q-card-section>
    <q-card-section>
      <q-input
        class="text-bold text-h6"
        v-model="amount"
        type="number"
        filled
        dense
        placeholder="Enter amount..."
      />
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        flat
        label="Cancel"
        color="primary"
        v-close-popup
      />
      <q-btn
        flat
        :disable="!isValid"
        label="Send"
        color="primary"
        @click="send()"
        v-close-popup
      />
    </q-card-actions>
  </q-card>
</template>

<script>
import { sentTransactionNotify, sentTransactionFailureNotify } from '../../utils/notifications'

const cashlib = require('bitcore-lib-cash')

export default {
  components: {
  },
  data () {
    return {
      address: '',
      amount: null
    }
  },
  computed: {
    isValid () {
      if (!this.amount) {
        return false
      }
      try {
        cashlib.Address(this.address, 'testnet') // TODO: Make this generic
        return true
      } catch {
        return false
      }
    }
  },
  methods: {
    async send () {
      try {
        let output = new cashlib.Transaction.Output({
          script: cashlib.Script(new cashlib.Address(this.address)),
          satoshis: this.amount
        })

        var { transaction, usedIDs } = this.$wallet.constructTransaction({ outputs: [output], exactOutputs: true })
        let txHex = transaction.toString()

        let electrumHandler = this.$electrumClient
        await electrumHandler.request('blockchain.transaction.broadcast', txHex)
        sentTransactionNotify(transaction)
      } catch (err) {
        sentTransactionFailureNotify(transaction)
        console.error(err)
        // Unfreeze UTXOs if stealth tx broadcast fails
        usedIDs.forEach(id => {
          this.$wallet.unfreezeUTXO(id)
        })
      }
    }
  }
}
</script>
