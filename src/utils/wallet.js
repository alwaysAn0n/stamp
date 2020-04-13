export const calcId = function (output) {
  return output.txId.slice(0, 20) + output.outputIndex
}

export const caldIdFromParts = function (txId, vout) {
  return txId.slice(0, 20) + vout
}

export const stampPrice = function (outpoints) {
  if (outpoints !== null) {
    let amount = outpoints.reduce((a, stampOutpoint) => {
      return stampOutpoint.vouts.reduce((b, vout) => {
        return stampOutpoint.stampTx.outputs[vout].satoshis + b
      }, 0) + a
    }, 0)
    return amount
  } else {
    // We return newline so that the message doesn't move when switching
    return null
  }
}
