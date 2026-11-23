import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, usePathname, useRouter } = createNavigation(routing);

/** The editor's address (SPEC §15.53): the landing page has `/`. */
export const EDITOR = "/editor";
