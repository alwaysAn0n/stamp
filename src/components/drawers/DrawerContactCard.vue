<template>
  <q-img
    class="absolute-top"
    style="height: 130px; background: royalblue"
  >
    <q-list class="absolute-bottom bg-transparent q-pa-none">
      <q-item class="bg-transparent q-pa-none">
        <q-item-section>
          <q-avatar rounded>
            <img :src="avatar">
          </q-avatar>
        </q-item-section>
        <q-item-section>
          <q-item-label
            style="text-align: right;"
            class="text-weight-bold text-white"
            lines="1"
          >Minimum Stamp</q-item-label>
          <q-item-label
            style="text-align: right;"
            class="text-white"
            caption
            lines="1"
          >{{ acceptancePrice }}
          </q-item-label>
        </q-item-section>
      </q-item>

      <q-item class="bg-transparent q-pa-none">
        <q-item-section>
          <q-item-label
            class="text-weight-bold text-white"
            lines="1"
          >{{ name }}</q-item-label>
          <q-item-label
            class="text-white"
            caption
            lines="1"
          >{{ address }}</q-item-label>

        </q-item-section>
        <q-item-section side>
          <q-btn
            flat
            dense
            color="white"
            icon="file_copy"
            size="sm"
            @click="copyAddress()"
          />
        </q-item-section>
      </q-item>
    </q-list>

  </q-img>
</template>

<script>
import { copyToClipboard } from 'quasar'
import { addressCopiedNotify } from '../../utils/notifications'

export default {
  props: ['avatar', 'name', 'bio', 'address', 'acceptancePrice'],
  methods: {
    copyAddress () {
      copyToClipboard(this.address).then(() => {
        addressCopiedNotify()
      })
        .catch(() => {
          // fail
        })
    }
  }
}
</script>
