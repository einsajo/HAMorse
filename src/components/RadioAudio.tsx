import { useEffect } from 'react'
import { useRadio } from '../context/RadioContext'
import { BROADCAST_STATIONS, formatMhz, getBandInfo, ghostProximity, isTunedTo } from '../constants'
import { setGhostProximity, setStaticLevel, staticLevelFor, tuneBroadcast } from '../utils/audioEngine'
import { LIVE_STREAMS } from '../data/liveStreams'

/**
 * Drives the radio's continuous sound from its state. Renders nothing.
 *
 *  - Band static: loudest on dead air, 50% on the ham band, 35% on a
 *    reserved carrier, 20% under a broadcaster, 10% on the ghost, silent when
 *    the radio is off.
 *  - Live broadcasts: on 89.30 / 93.50 / 98.10 the receiver plays that
 *    station's real internet stream through a vintage AM chain (RX only;
 *    src/data/liveStreams.ts), with the static crackling over it.
 *  - The wandering ghost: within 0.80 MHz of it the static drains away and
 *    a low, detuned drone rises in its place, the closer the louder. Exactly
 *    on the frequency the drone stops dead (and the S-meter pins at +40 dB).
 *
 * Audio itself only starts once the MAIN POWER breaker has been operated
 * (see audioEngine.unlockAudio).
 */
export default function RadioAudio() {
  const { frequency, isPowerOn } = useRadio()
  const { band } = getBandInfo(frequency)
  const closeness = isPowerOn ? ghostProximity(frequency) : 0
  const broadcaster = band === 'broadcast' ? BROADCAST_STATIONS.find((f) => isTunedTo(frequency, f)) : undefined
  const streamUrl = isPowerOn && broadcaster !== undefined ? (LIVE_STREAMS[formatMhz(broadcaster)]?.url ?? null) : null

  useEffect(() => {
    setStaticLevel(staticLevelFor(band, isPowerOn) * (1 - closeness))
    setGhostProximity(closeness)
  }, [band, isPowerOn, closeness])

  useEffect(() => {
    tuneBroadcast(streamUrl)
  }, [streamUrl])

  return null
}
