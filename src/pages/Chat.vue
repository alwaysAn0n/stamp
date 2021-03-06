<template>
  <div>
    <!-- Send file dialog -->
    <q-dialog v-model="sendFileOpen" persistent>
      <send-file-dialog :address="address" />
    </q-dialog>

    <q-scroll-area
      ref="chatScroll"
      class="q-px-md row"
      :style="scrollAreaStyle"
    >
      <q-chat-message
        class="q-py-sm"
        avatar="~/assets/cashweb-avatar.png"
        :sent="false"
        :text="[
            donationMessage
            ]"
        size="6"
      />
      <chat-message
        v-for="(chatMessage, index) in messages"
        :key="index"
        :address="address"
        :message="chatMessage"
        :contact="getContact(chatMessage.outbound)"
        :index="index"
        :now="now"
        @replyClicked="({ address, index }) => setReply(index)"
      />
      <q-scroll-observer debounce="500" @scroll="scrollHandler" />
    </q-scroll-area>

    <!-- Reply box -->
    <div ref="replyBox">
      <div class="q-pa-sm" v-if="replyDigest">
        <div class="q-pa-sm bg-secondary row" style="border-radius: 5px;">
          <chat-message-reply class="col" :item="replyItem" />
          <q-btn
            dense
            flat
            color="accent"
            icon="close"
            @click="setReply(null)"
          />
        </div>
      </div>
    </div>

    <!-- Message box -->
    <chat-input
      ref="chatInput"
      v-model="message"
      @sendMessage="sendMessage"
      @sendFileClicked="sendFileClicked"
    />
    <q-page-sticky position="bottom-right" :offset="[18, 64]" v-show="!bottom">
      <q-btn
        round
        size="md"
        icon="keyboard_arrow_down"
        color="accent"
        @click="scrollBottom"
      />
    </q-page-sticky>
  </div>
</template>

<script>
import moment from 'moment'
import { mapGetters } from 'vuex'
import { dom } from 'quasar'
const { height } = dom

import ChatInput from '../components/chat/ChatInput.vue'
import ChatMessage from '../components/chat/ChatMessage.vue'
import SendFileDialog from '../components/dialogs/SendFileDialog.vue'
import ChatMessageReply from '../components/chat/ChatMessageReply.vue'
import { donationMessage } from '../utils/constants'
import { insufficientStampNotify } from '../utils/notifications'

const scrollDuration = 0

export default {
  props: {
    address: String,
    messages: {
      type: Object,
      default: () => {}
    },
    active: {
      type: Boolean,
      default: () => false
    }
  },
  components: {
    ChatMessage,
    SendFileDialog,
    ChatMessageReply,
    ChatInput
  },
  data () {
    return {
      timer: null,
      now: moment(),
      sendFileOpen: false,
      bottom: true,
      message: '',
      replyDigest: null,
      donationMessage
    }
  },
  created () {
    this.timer = setInterval(() => { this.now = moment() }, 60000)
  },
  destroyed () {
    clearTimeout(this.timer)
  },

  methods: {
    ...mapGetters({
      getAcceptancePrice: 'contacts/getAcceptancePrice',
      getStampAmount: 'chats/getStampAmount'
    }),
    sendMessage (message) {
      const stampAmount = this.getStampAmount()(this.address)
      const acceptancePrice = this.getAcceptancePrice()(this.address)
      if (stampAmount < acceptancePrice) {
        insufficientStampNotify()
      }
      if (message !== '') {
        this.$relayClient.sendMessage({ addr: this.address, text: message, replyDigest: this.replyDigest, stampAmount })
        this.message = ''
        this.replyDigest = null
        this.$nextTick(() => this.$refs.chatInput.$el.focus())
      }
    },
    scrollBottom () {
      const scrollArea = this.$refs.chatScroll
      if (scrollArea) {
        const scrollTarget = scrollArea.getScrollTarget()
        this.$nextTick(() => scrollArea.setScrollPosition(scrollTarget.scrollHeight, scrollDuration))
      }
    },
    sendFileClicked () {
      this.sendFileOpen = true
    },
    getContact (outbound) {
      if (outbound) {
        return this.getProfile
      } else {
        return this.getContactVuex(this.address).profile
      }
    },
    scrollHandler (details) {
      const scrollArea = this.$refs.chatScroll
      const scrollTarget = scrollArea.getScrollTarget()
      if (scrollTarget.scrollHeight === details.position + scrollTarget.offsetHeight) {
        this.bottom = true
      } else {
        this.bottom = false
      }
    },
    offsetHeight () {
      // TODO: This isn't reactive enough. It's somewhat slow to recalculate
      const inputBoxHeight = this.$refs.chatInput ? height(this.$refs.chatInput.$el) : 50
      const replyHeight = this.$refs.replyBox ? height(this.$refs.replyBox) : 0
      // Sometimes this returns zero when the component isnt' shown. However, it then dates some time to update properly when switching to it.
      // Set a minimum of 50.
      return Math.max(inputBoxHeight + replyHeight, 50)
    },
    setReply (index) {
      this.replyDigest = index
    }
  },
  computed: {
    ...mapGetters({
      getContactVuex: 'contacts/getContact',
      getMessage: 'chats/getMessage',
      getProfile: 'myProfile/getProfile'
    }),
    scrollAreaStyle () {
      return {
        height: `calc(100% - ${this.offsetHeight()}px)`,
        minHeight: `calc(100%-${this.offsetHeight()}px)`
      }
    },
    replyItem () {
      if (!this.replyDigest) {
        return null
      }
      const msg = this.getMessage(this.address, this.replyDigest)
      if (!msg) {
        return null
      }
      const firstNonReply = msg.items.find(item => item.type !== 'reply')
      return firstNonReply
    }
  },
  watch: {
    messages () {
      // Scroll to bottom if user was already there.
      if (this.bottom) {
        this.scrollBottom()
      }
    },
    active () {
      const scrollArea = this.$refs.chatScroll
      const scrollTarget = scrollArea.getScrollTarget()
      // Scroll to bottom only if the view was effectively in it's initial state.
      if (scrollTarget.scrollTop === 0) {
        this.scrollBottom()
      }
      // TODO: Scroll to last unread
    },
    '$q.dark.isActive' (val) {
      this.bodyBackground = val ? '#121212' : 'lightblue'
    }
  }
}
</script>

<style scoped>
/* Enter and leave animations can use different */
/* durations and timing functions.              */
.slide-enter-active {
  transition: all 0.3s ease;
}
.slide-leave-active {
  transition: all 0.3s;
}
.slide-enter, .slide-leave-to
/* .slide-fade-leave-active below version 2.1.8 */ {
  transform: translateX(10px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
</style>
