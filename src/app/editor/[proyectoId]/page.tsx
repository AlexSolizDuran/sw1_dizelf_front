import type { Metadata } from "next";
import { EditorLoader } from "./editor-loader";

export const metadata: Metadata = {
  title: "Editor · DIZELF",
  description: "Editor de planos arquitectónicos 2D/3D",
};

export default async function EditorPage(props: PageProps<"/editor/[proyectoId]">) {
  const { proyectoId } = await props.params;
  return <EditorLoader proyectoId={proyectoId} />;
}
