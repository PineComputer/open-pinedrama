// Where a screen's inspector goes: beside the scroll area, as design/'s screens put it (.body > .scrollmain
// and aside.insp), so it starts under the top bar rather than under what scrolls. The shell provides it; a
// screen rendered outside the shell (a test) has none and keeps its inspector in place.
import { createContext } from "react";

export const AsideSlot = createContext<HTMLElement | null>(null);
