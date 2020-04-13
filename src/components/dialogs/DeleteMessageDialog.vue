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

export default {
  props: ['address', 'index'],
  methods: {
    ...mapActions({
      deleteMessage: 'chats/deleteMessage'
    }),
    ...mapGetters({
      getRelayClient: 'relayClient/getClient',
      getToken: 'relayClient/getToken',
      getMessage: 'chats/getMessage',
      isUTXO: 'wallet/isUTXO',
      getUTXO: 'wallet/getUTXO'
    }),
    deleteMessageBoth () {
      // TODO: Move this into wallet API
      // TODO: More private
      // Get utxos attached to message
      const outpoints = this.getMessage()(this.address, this.index).outpoints
      const utxos = outpoints.reduce(function (allOutputs, currentOutpoints) {
        const newOutputs = currentOutpoints.vouts.reduce(function (outputs, currentVout) {
          const id = caldIdFromParts(currentOutpoints.stampTx.hash, currentVout)
          outputs.push(id)
          return outputs
        }, [])
        let newTotal = allOutputs.concat(newOutputs)
        return newTotal
      }, [])

      // Filter spent utxos
      const filteredUtxos = utxos.filter((id) => this.isUTXO()(id)).map((id) => this.getUTXO()(id))
      console.log(filteredUtxos)

      this.deleteMessage({ addr: this.address, id: this.index })
      const client = this.getRelayClient()
      const token = this.getToken()
      try {
        client.deleteMessage(this.address, token, this.index)
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
