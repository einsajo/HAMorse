/**
 * International Morse code (ITU-R M.1677-1): letters and figures.
 *
 * The single source of truth for Morse in the app: the decoder looks codes up
 * here, and the reference card prints its table from it. Validated by the
 * `morse-validator` power (.kiro/powers/morse-validator), which the
 * `validate-morse` agent hook runs whenever this file is saved:
 *
 *   node .kiro/powers/morse-validator/skills/validate-morse/scripts/validate-morse.mjs --strict
 *
 * Dit = "." and dah = "-". Keys are Morse codes, values are characters.
 * A-Z and 0-9 are required (and validated); a little punctuation is included
 * so the reply stations can send it.
 */
export const MORSE_DICTIONARY: Readonly<Record<string, string>> = Object.freeze({
  // letters
  '.-': 'A',
  '-...': 'B',
  '-.-.': 'C',
  '-..': 'D',
  '.': 'E',
  '..-.': 'F',
  '--.': 'G',
  '....': 'H',
  '..': 'I',
  '.---': 'J',
  '-.-': 'K',
  '.-..': 'L',
  '--': 'M',
  '-.': 'N',
  '---': 'O',
  '.--.': 'P',
  '--.-': 'Q',
  '.-.': 'R',
  '...': 'S',
  '-': 'T',
  '..-': 'U',
  '...-': 'V',
  '.--': 'W',
  '-..-': 'X',
  '-.--': 'Y',
  '--..': 'Z',
  // figures
  '-----': '0',
  '.----': '1',
  '..---': '2',
  '...--': '3',
  '....-': '4',
  '.....': '5',
  '-....': '6',
  '--...': '7',
  '---..': '8',
  '----.': '9',
  // punctuation used on air (e.g. "GUD COPY.", "FB. 73.")
  '.-.-.-': '.',
  '--..--': ',',
  '..--..': '?',
  '-..-.': '/',
})

/** Reverse lookup: character -> Morse code (e.g. 'A' -> '.-') */
export const CHAR_TO_MORSE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(MORSE_DICTIONARY).map(([code, ch]) => [ch, code])),
)

/** Table order used by the printed reference card: A-Z, then 1-9, then 0 */
export const MORSE_TABLE_ORDER = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'] as const

/**
 * Q-codes printed on the reference card. These are sent as their letters,
 * one character at a time (CQ = C then Q), so `morse` is space-separated.
 */
export interface QCode {
  meaning: string
  morse: string
}

export const Q_CODES: Readonly<Record<string, QCode>> = Object.freeze({
  CQ: { meaning: 'Calling any station', morse: '-.-. --.-' },
  QRT: { meaning: 'Stop transmission', morse: '--.- .-. -' },
})

/** Decode one Morse symbol ('.-' -> 'A'); undefined when the code is unknown */
export function decodeSymbol(code: string): string | undefined {
  return MORSE_DICTIONARY[code]
}

/** Encode text as Morse: letters separated by spaces, words by ' / ' */
export function encodeText(text: string): string {
  return text
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .map((word) => [...word].map((ch) => CHAR_TO_MORSE[ch] ?? '?').join(' '))
    .join(' / ')
}

/** Pretty-print a code with typographic dits/dahs for printed material ('.-' -> '·–') */
export function toTypographic(code: string): string {
  return code.replace(/\./g, '·').replace(/-/g, '–')
}
