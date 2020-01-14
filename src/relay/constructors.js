import messages from './messages_pb'
import filters from './filters_pb'
import crypto from './crypto'

const cashlib = require('bitcore-lib-cash')

export default {
  constructTextMessage (text, privKey, destPubKey, scheme) {
    // Construct text entry
    let textEntry = new messages.Entry()
    textEntry.setKind('text-utf8')
    let rawText = new TextEncoder('utf-8').encode(text)
    textEntry.setEntryData(rawText)

    // Aggregate entries
    let entries = new messages.Entries()
    entries.addEntries(textEntry)

    let payload = new messages.Payload()
    payload.setTimestamp(Math.floor(Date.now() / 1000))
    let rawDestPubKey = destPubKey.toBuffer()
    payload.setDestination(rawDestPubKey)

    // Serialize and encrypt
    let rawEntries = entries.serializeBinary()
    if (scheme === 0) {
      payload.setEntries(rawEntries)
    } else if (scheme === 1) {
      let { cipherText, ephemeralPubKey } = crypto.encrypt(rawEntries, privKey, destPubKey)
      let ephemeralPubKeyRaw = ephemeralPubKey.toBuffer()

      payload.setEntries(cipherText)
      payload.setSecretSeed(ephemeralPubKeyRaw)
    } else {
      // TODO: Raise error
      return
    }
    let serializedPayload = payload.serializeBinary()
    let hashbuf = cashlib.crypto.Hash.sha256(serializedPayload)
    let ecdsa = cashlib.crypto.ECDSA({ privkey: privKey, hashbuf })
    ecdsa.sign()

    let message = new messages.Message()
    let sig = ecdsa.sig.toCompact(1).slice(1)
    let rawPubkey = privKey.toPublicKey().toBuffer()
    message.setSenderPubKey(rawPubkey)
    message.setSignature(sig)
    message.setScheme(1)
    message.setSerializedPayload(serializedPayload)

    return message
  },
  constructPriceFilterApplication (isPublic, acceptancePrice, notificationPrice, privKey) {
    // Construct PriceFilter
    let priceFilter = new filters.PriceFilter()
    priceFilter.setPublic(isPublic)
    priceFilter.setAcceptancePrice(acceptancePrice)
    priceFilter.setNotificationPrice(notificationPrice)

    // Construct Filter
    let filtersMsg = new filters.Filters()
    filtersMsg.setPriceFilter(priceFilter)

    // Construct FilterApplication
    let serializedFilters = filtersMsg.serializeBinary()
    let hashbuf = cashlib.crypto.Hash.sha256(serializedFilters)
    let ecdsa = cashlib.crypto.ECDSA({ privkey: privKey, hashbuf })
    ecdsa.sign()

    let filterApplication = new filters.FilterApplication()
    let sig = ecdsa.sig.toCompact(1).slice(1)
    filterApplication.setPubKey(privKey.toPublicKey().toBuffer())
    filterApplication.setSignature(sig)
    filterApplication.setScheme(1)
    filterApplication.setSerializedFilters(serializedFilters)

    return filterApplication
  }
}