import { common } from "./dict/common";
import { landing } from "./dict/landing";
import { pages } from "./dict/pages";
import { features } from "./dict/features";
import { resident } from "./dict/resident";
import { resident2 } from "./dict/resident2";

/** Every translatable UI string. Missing entries fall back to the English text. */
export const DICT: Record<string, [string, string, string, string]> = { ...common, ...landing, ...pages, ...features, ...resident, ...resident2 };
