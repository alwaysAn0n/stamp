<template>
  <q-card>
    <q-card-section class="row items-center">
      <q-avatar
        icon="delete"
        color="red"
        text-color="white"
      />
    </q-card-section>

    <q-card-section>
      <span class="q-ml-sm">Are you sure you want to delete this message? This will delete the message from the relay server too.</span>
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
        label="Delete"
        color="primary"
        v-close-popup
        @click="deleteMessageBoth()"
      />
    </q-card-actions>
  </q-card>
</template>

<script>
import { mapActions, mapGetters } from 'vuex'
import { caldIdFromParts } from '../../utils/wallet'
import { sentTransactionFailureNotify } from '../../utils/notifications'

export default {
  props: ['address', 'index'],
  methods: {
    ...mapActions({
      deleteMessage: 'chats/deleteMessage',
      forwardTransaction: 'wallet/forwardTransaction',
      getFee: 'wallet/getFee',
      unfreezeUTXO: 'wallet/unfreezeUTXO'
    }),
    ...mapGetters({
      getRelayClient: 'relayClient/getClient',
      getElectrumClient: 'electrumHandler/getClient',
      getToken: 'relayClient/getToken',
      getMessage: 'chats/getMessage',
      isUTXO: 'wallet/isUTXO',
      getUTXO: 'wallet/getUTXO',
      getChangeAddresses: 'wallet/getChangeAddresses',
      getMyAddressStr: 'wallet/getMyAddressStr'
    }),
    async deleteMessageBoth () {
      // TODO: Move this into wallet API
      // TODO: More private

      // Get utxos attached to message
      const outpoints = this.getMessage()(this.address, this.index).outpoints
      const filteredUtxos = outpoints.reduce(function (allOutputs, currentOutpoints) {
        const newOutputs = currentOutpoints.vouts.reduce(function (outputs, currentVout) {
          const id = caldIdFromParts(currentOutpoints.stampTx.hash, currentVout)
          outputs.push(id)
          return outputs
        }, [])
        let newTotal = allOutputs.concat(newOutputs)
        return newTotal
      }, []).filter((id) => this.isUTXO()(id))

      try {
        if (filteredUtxos.length) {
          // Send utxos to a change address
          const changeAddresses = Object.keys(this.getChangeAddresses())
          const changeAddress = changeAddresses[changeAddresses.length * Math.random() << 0]
          const feePerByte = await this.getFee()
          var { transaction, usedIDs } = await this.forwardTransaction({ inputIds: filteredUtxos, addr: changeAddress, feePerByte })
          const txHex = transaction.toString()
          const electrumHandler = this.getElectrumClient()
          await electrumHandler.methods.blockchain_transaction_broadcast(txHex)
        }
      } catch (err) {
        sentTransactionFailureNotify(transaction)
        console.error(err)
        // Unfreeze UTXOs if stealth tx broadcast fails
        usedIDs.forEach(id => {
          this.unfreezeUTXO(id)
        })
        return
      }

      // Delete message from relay server
      this.deleteMessage({ addr: this.address, id: this.index })
      const client = this.getRelayClient()
      const token = this.getToken()
      try {
        const myAddr = this.getMyAddressStr()
        client.deleteMessage(myAddr, token, this.index)
      } catch (err) {
        console.error(err)
        if (err.response) {
          console.error(err.response)
        }
      }
    }
  }
}
</script>
