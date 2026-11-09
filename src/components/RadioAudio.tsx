import { useEffect } from 'react'
import { useRadio } from '../context/RadioContext'
import { getBandInfo } from '../constants'
import { setStaticLevel, staticLevelFor } from '../utils/audioEngine'

/**
 * Drives the band static from the radio state: loudest on dead air, 50% on the
 * ham band, 20% under a broadcaster, 10% on the ghost frequency, silent when
 * the radio is off. Renders nothing. Audio itself only starts once the MAIN
 * POWER breaker has been operated (see audioEngine.unlockAudio).
 */
export default function RadioAudio() {
  const { frequency, isPowerOn } = useRadio()
  const { band } = getBandInfo(frequency)

  useEffect(() => {
    setStaticLevel(staticLevelFor(band, isPowerOn))
  }, [band, isPowerOn])

  return null
}
