import type { Filter, Kernel5x5 } from "../types.js";
import { convolve } from "./convolve.js";

const SHARPEN_5X5: Kernel5x5 = [
  0, 0, -1,  0, 0,
  0, 0, -1,  0, 0,
 -1,-1, 13, -1,-1,
  0, 0, -1,  0, 0,
  0, 0, -1,  0, 0,
];

/** Applies a 5x5 sharpening filter. */
export function sharpen(): Filter {
  return convolve({ kernel: SHARPEN_5X5, divisor: 5 });
}
