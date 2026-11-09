import { useEffect } from 'react'
import { useRadio } from '../context/RadioContext'
import { getBandInfo, ghostProximity } from '../constants'
import { setGhostProximity, setStaticLevel, staticLevelFor } from '../utils/audioEngine'

/**
 * Drives the radio's continuous sound from its state. Renders nothing.
 *
 *  - Band static: loudest on dead air, 50% on the ham band, 35% on a
 *    reserved carrier, 20% under a broadcaster, 10% on the ghost, silent when
 *    the radio is off.
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

  useEffect(() => {
    setStaticLevel(staticLevelFor(band, isPowerOn) * (1 - closeness))
    setGhostProximity(closeness)
  }, [band, isPowerOn, closeness])

  return null
}
