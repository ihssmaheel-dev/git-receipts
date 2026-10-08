/** Standard Code 128 symbol patterns, as published in JsBarcode's MIT-licensed table.
 * https://github.com/lindell/JsBarcode/blob/master/src/barcodes/CODE128/constants.js
 *
 * Copyright (c) 2016 Johan Lindell (johan@lindell.me)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
const code128Patterns = [
  11011001100, 11001101100, 11001100110, 10010011000, 10010001100,
  10001001100, 10011001000, 10011000100, 10001100100, 11001001000,
  11001000100, 11000100100, 10110011100, 10011011100, 10011001110,
  10111001100, 10011101100, 10011100110, 11001110010, 11001011100,
  11001001110, 11011100100, 11001110100, 11101101110, 11101001100,
  11100101100, 11100100110, 11101100100, 11100110100, 11100110010,
  11011011000, 11011000110, 11000110110, 10100011000, 10001011000,
  10001000110, 10110001000, 10001101000, 10001100010, 11010001000,
  11000101000, 11000100010, 10110111000, 10110001110, 10001101110,
  10111011000, 10111000110, 10001110110, 11101110110, 11010001110,
  11000101110, 11011101000, 11011100010, 11011101110, 11101011000,
  11101000110, 11100010110, 11101101000, 11101100010, 11100011010,
  11101111010, 11001000010, 11110001010, 10100110000, 10100001100,
  10010110000, 10010000110, 10000101100, 10000100110, 10110010000,
  10110000100, 10011010000, 10011000010, 10000110100, 10000110010,
  11000010010, 11001010000, 11110111010, 11000010100, 10001111010,
  10100111100, 10010111100, 10010011110, 10111100100, 10011110100,
  10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
  11011110110, 11110110110, 10101111000, 10100011110, 10001011110,
  10111101000, 10111100010, 11110101000, 11110100010, 10111011110,
  10111101110, 11101011110, 11110101110, 11010000100, 11010010000,
  11010011100, 1100011101011,
] as const;

export type ReceiptBarcode = {
  value: string;
  /** Width in narrow-module units, including both ten-module quiet zones. */
  width: number;
  quietZone: number;
  bars: { x: number; width: number }[];
};

/** Encode the exact receipt number, rather than drawing decorative random bars. */
export function createReceiptBarcode(value: string): ReceiptBarcode {
  if (!/^[0-9]+-[0-9]+-[0-9]+$/.test(value)) {
    throw new TypeError("A receipt barcode requires a year-total-activeDays number.");
  }
  const start = 104; // Code 128 set B: printable ASCII, no GS1/FNC1 prefix.
  const symbols = Array.from(value, (character) => character.charCodeAt(0) - 32);
  const checksum = symbols.reduce((sum, symbol, index) => sum + symbol * (index + 1), start) % 103;
  const modules = [start, ...symbols, checksum, 106].map((symbol) => String(code128Patterns[symbol])).join("");
  const quietZone = 10;
  const bars: ReceiptBarcode["bars"] = [];
  for (let column = 0; column < modules.length; column += 1) {
    if (modules[column] !== "1") continue;
    const first = column;
    while (modules[column + 1] === "1") column += 1;
    bars.push({ x: first + quietZone, width: column - first + 1 });
  }
  return { value, width: modules.length + quietZone * 2, quietZone, bars };
}
