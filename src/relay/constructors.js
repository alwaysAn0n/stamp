import messaging from './messaging_pb'
import stealth from './stealth_pb'
import filters from './filters_pb'
import { constructStampPubKey, constructStealthPubKey, encrypt, encryptEphemeralKey } from './crypto'
import store from '../store/index'
import VCard from 'vcf'
import addressmetadata from '../keyserver/addressmetadata_pb'
import wrapper from '../pop/wrapper_pb'

const cashlib = require('bitcore-lib-cash')

export const constructStampTransaction = async function ({ payloadDigest, outpointIndex, vout }, destPubKey, amount) {
  // Stamp output
  let stampAddress = constructStampPubKey({ payloadDigest, outpointIndex, vout }, destPubKey).toAddress('testnet')
  let stampOutput = new cashlib.Transaction.Output({
    script: cashlib.Script(new cashlib.Address(stampAddress)),
    satoshis: amount
  })

  // Get Fee
  let feePerByte = await store.dispatch('wallet/getFee')

  // Construct transaction
  let { transaction, usedIDs } = await store.dispatch('wallet/constructTransaction', { outputs: [stampOutput], feePerByte })
  return { transaction, usedIDs }
}

export const constructStealthTransaction = async function (ephemeralPrivKey, destPubKey, amount) {
  // Add ephemeral output
  // NOTE: We're only doing 1 stealth txn, and 1 output for now.
  // But the spec should allow doing confidential amounts.
  const outputPrivKey = ephemeralPrivKey.deriveChild(44, true)
    .deriveChild(145, true)
    .deriveChild(0, true)
    .deriveChild(0) // Stealth txn number
    .deriveChild(0)// Vout
    .privateKey
  let stealthAddress = constructStealthPubKey(outputPrivKey, destPubKey).toAddress('testnet')
  let stealthOutput = new cashlib.Transaction.Output({
    script: cashlib.Script(new cashlib.Address(stealthAddress)),
    satoshis: amount
  })

  // Get Fee
  let feePerByte = await store.dispatch('wallet/getFee')

  // Construct transaction
  let { transaction, usedIDs } = await store.dispatch('wallet/constructTransaction', { outputs: [stealthOutput], feePerByte })
  return [{ transaction, vouts: [0], usedIDs }]
}

export const constructMessage = async function (payload, privKey, destPubKey, stampAmount) {
  let serializedPayload = payload.serializeBinary()
  let payloadDigest = cashlib.crypto.Hash.sha256(serializedPayload)
  let ecdsa = cashlib.crypto.ECDSA({ privkey: privKey, hashbuf: payloadDigest })
  ecdsa.sign()

  let message = new messaging.Message()
  let sig = ecdsa.sig.toCompact(1).slice(1)
  let rawPubkey = privKey.toPublicKey().toBuffer()
  message.setSenderPubKey(rawPubkey)
  message.setSignature(sig)
  message.setSerializedPayload(serializedPayload)

  let { transaction, usedIDs } = await constructStampTransaction({ payloadDigest,
    outpointIndex: 0,
    vout: 0
  }, destPubKey, stampAmount)
  let rawStampTx = transaction.toBuffer()
  let stampOutpoints = new messaging.StampOutpoints()
  stampOutpoints.setStampTx(rawStampTx)
  stampOutpoints.addVouts(0)

  message.addStampOutpoints(stampOutpoints)

  return { message, usedIDs, stampTx: transaction }
}

export const constructOutboxMessage = function (payload, privKey) {
  let serializedPayload = payload.serializeBinary()
  let payloadDigest = cashlib.crypto.Hash.sha256(serializedPayload)
  let ecdsa = cashlib.crypto.ECDSA({ privkey: privKey, hashbuf: payloadDigest })
  ecdsa.sign()

  let message = new messaging.Message()
  let sig = ecdsa.sig.toCompact(1).slice(1)
  let rawPubkey = privKey.toPublicKey().toBuffer()
  message.setSenderPubKey(rawPubkey)
  message.setSignature(sig)
  message.setSerializedPayload(serializedPayload)

  return message
}

export const constructPayload = function (entries, privKey, destPubKey, scheme, timestamp) {
  let payload = new messaging.Payload()
  payload.setTimestamp(timestamp)
  let rawDestPubKey = destPubKey.toBuffer()
  payload.setDestination(rawDestPubKey)

  // Serialize and encrypt
  let rawEntries = entries.serializeBinary()
  if (scheme === 0) {
    payload.setEntries(rawEntries)
  } else if (scheme === 1) {
    let { cipherText, ephemeralPrivKey } = encrypt(rawEntries, privKey, destPubKey)
    let ephemeralPubKey = ephemeralPrivKey.toPublicKey()
    let ephemeralPubKeyRaw = ephemeralPubKey.toBuffer()
    let entriesDigest = cashlib.crypto.Hash.sha256(cipherText)
    let encryptedEphemeralKey = encryptEphemeralKey(ephemeralPrivKey, privKey, entriesDigest)

    payload.setEntries(cipherText)
    payload.setEphemeralPubKey(ephemeralPubKeyRaw)
    payload.setEphemeralPrivKey(encryptedEphemeralKey)
    payload.setScheme(messaging.Payload.EncryptionScheme.EPHEMERALDH)
  } else {
    // TODO: Raise error
    return
  }
  return payload
}

const constructReplyEntry = function (payloadDigest) {
  let entry = new messaging.Entry()
  entry.setKind('reply')
  entry.setEntryData(payloadDigest)
  return entry
}

export const constructTextPayload = function (text, privKey, destPubKey, scheme, replyDigest) {
  let entries = new messaging.Entries()

  // Add reply entry
  if (replyDigest) {
    let entry = constructReplyEntry(replyDigest)
    entries.addEntries(entry)
  }

  // Add text entry
  let textEntry = new messaging.Entry()
  textEntry.setKind('text-utf8')
  let rawText = new TextEncoder('utf-8').encode(text)
  textEntry.setEntryData(rawText)
  entries.addEntries(textEntry)

  // Construct message
  let timestamp = Math.floor(Date.now() / 1000)
  let payload = constructPayload(entries, privKey, destPubKey, scheme, timestamp)

  // Calc digest
  let payloadRaw = payload.serializeBinary()
  let payloadDigest = cashlib.crypto.Hash.sha256(payloadRaw)
  return { payload, payloadDigest }
}

export const constructStealthPaymentPayload = async function (amount, memo, privKey, destPubKey, scheme, stealthTxId, replyDigest) {
  let entries = new messaging.Entries()

  // Add reply entry
  if (replyDigest) {
    let entry = constructReplyEntry(replyDigest)
    entries.addEntries(entry)
  }

  // Construct payment entry
  let paymentEntry = new messaging.Entry()
  paymentEntry.setKind('stealth-payment')

  let stealthPaymentEntry = new stealth.StealthPaymentEntry()
  let ephemeralPrivKey = cashlib.HDPrivateKey()

  var [{ transaction: stealthTx, usedIDs: stampUsedIDs, vouts }] = await constructStealthTransaction(ephemeralPrivKey, destPubKey, amount)
  stealthTxId = Buffer.from(stealthTx.id, 'hex')

  // Broadcast transaction
  let stealthTxHex = stealthTx.toString()
  try {
    let electrumHandler = store.getters['electrumHandler/getClient']
    await electrumHandler.methods.blockchain_transaction_broadcast(stealthTxHex)
  } catch (err) {
    console.error(err)
    // Unfreeze UTXOs if stealth tx broadcast fails
    stampUsedIDs.forEach(id => {
      store.dispatch('unfreezeUTXO', id)
    })
    throw err
  }

  stealthPaymentEntry.setEphemeralPubKey(ephemeralPrivKey.toPublicKey().toBuffer())
  let rawStealthTx = stealthTx.toBuffer()
  let stampOutpoints = new stealth.StealthOutpoints()
  stampOutpoints.setStealthTx(rawStealthTx)
  vouts.forEach((vout) => stampOutpoints.addVouts(vout))
  stealthPaymentEntry.addStealthOutpoints(stampOutpoints)

  let paymentEntryRaw = stealthPaymentEntry.serializeBinary()
  paymentEntry.setEntryData(paymentEntryRaw)
  entries.addEntries(paymentEntry)

  // Construct memo entry
  if (memo !== '') {
    let memoEntry = new messaging.Entry()
    memoEntry.setKind('text-utf8')
    let rawText = new TextEncoder('utf-8').encode(memo)
    memoEntry.setEntryData(rawText)
    entries.addEntries(memoEntry)
  }

  // Construct message
  let timestamp = Math.floor(Date.now() / 1000)
  let payload = constructPayload(entries, privKey, destPubKey, scheme, timestamp)

  // Calc digest
  let payloadRaw = payload.serializeBinary()
  let payloadDigest = cashlib.crypto.Hash.sha256(payloadRaw)

  return { payload, payloadDigest }
}

export const constructImagePayload = function (image, caption, privKey, destPubKey, scheme, replyDigest) {
  let entries = new messaging.Entries()

  // Add reply entry
  if (replyDigest) {
    let entry = constructReplyEntry(replyDigest)
    entries.addEntries(entry)
  }

  // Construct text entry
  let imgEntry = new messaging.Entry()
  imgEntry.setKind('image')

  let arr = image.split(',')
  let avatarType = arr[0].match(/:(.*?);/)[1]
  let bstr = atob(arr[1])
  let n = bstr.length
  let rawAvatar = new Uint8Array(n)

  while (n--) {
    rawAvatar[n] = bstr.charCodeAt(n)
  }
  let imgHeader = new messaging.Header()
  imgHeader.setName('data')
  imgHeader.setValue(avatarType)
  imgEntry.setEntryData(rawAvatar)
  imgEntry.addHeaders(imgHeader)

  entries.addEntries(imgEntry)

  // Construct caption entry
  if (caption !== '') {
    let captionEntry = new messaging.Entry()
    captionEntry.setKind('text-utf8')
    let rawText = new TextEncoder('utf-8').encode(caption)
    captionEntry.setEntryData(rawText)
    entries.addEntries(captionEntry)
  }

  // Construct message
  let timestamp = Math.floor(Date.now() / 1000)
  let payload = constructPayload(entries, privKey, destPubKey, scheme, timestamp)

  // Calc digest
  let payloadRaw = payload.serializeBinary()
  let payloadDigest = cashlib.crypto.Hash.sha256(payloadRaw)

  return { payload, payloadDigest }
}

export const constructPriceFilter = function (isPublic, acceptancePrice, notificationPrice, privKey) {
  // Construct PriceFilter
  let priceFilter = new filters.PriceFilter()
  priceFilter.setPublic(isPublic)
  priceFilter.setAcceptancePrice(acceptancePrice)
  priceFilter.setNotificationPrice(notificationPrice)

  return priceFilter
}

export const constructProfileMetadata = function (profile, priceFilter, privKey) {
  // Construct vCard
  let vCard = new VCard()
  vCard.set('fn', profile.name)
  vCard.set('note', profile.bio)
  let rawCard = new TextEncoder().encode(vCard.toString())

  let cardEntry = new addressmetadata.Entry()
  cardEntry.setKind('vcard')
  cardEntry.setEntryData(rawCard)

  // Construct avatar
  let imgEntry = new addressmetadata.Entry()
  imgEntry.setKind('avatar')

  let arr = profile.avatar.split(',')
  let avatarType = arr[0].match(/:(.*?);/)[1]
  let bstr = atob(arr[1])
  let n = bstr.length
  let rawAvatar = new Uint8Array(n)

  while (n--) {
    rawAvatar[n] = bstr.charCodeAt(n)
  }
  let imgHeader = new addressmetadata.Header()
  imgHeader.setName('data')
  imgHeader.setValue(avatarType)
  imgEntry.setEntryData(rawAvatar)
  imgEntry.addHeaders(imgHeader)

  // Construct price filter
  let filterEntry = new addressmetadata.Entry()
  filterEntry.setKind('price-filter')
  let rawPriceFilter = priceFilter.serializeBinary()
  filterEntry.setEntryData(rawPriceFilter)

  // Construct payload
  let payload = new addressmetadata.Payload()
  payload.setTimestamp(Math.floor(Date.now() / 1000))
  payload.setTtl(31556952) // 1 year
  payload.addEntries(cardEntry)
  payload.addEntries(imgEntry)
  payload.addEntries(filterEntry)

  let serializedPayload = payload.serializeBinary()
  let hashbuf = cashlib.crypto.Hash.sha256(serializedPayload)
  let ecdsa = cashlib.crypto.ECDSA({ privkey: privKey, hashbuf })
  ecdsa.sign()

  let metadata = new wrapper.AuthWrapper()
  let sig = ecdsa.sig.toCompact(1).slice(1)
  metadata.setPubKey(privKey.toPublicKey().toBuffer())
  metadata.setSignature(sig)
  metadata.setScheme(1)
  metadata.setSerializedPayload(serializedPayload)

  return metadata
}
