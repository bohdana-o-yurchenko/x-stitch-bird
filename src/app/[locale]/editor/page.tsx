import { setRequestLocale } from "next-intl/server";
import { EditorEntry } from "@/ui/EditorEntry";

export default async function EditorPage({ params }: PageProps<"/[locale]/editor">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <EditorEntry />;
}
