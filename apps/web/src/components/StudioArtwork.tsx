import Image from "next/image";
export default function StudioArtwork({ kind }: { kind: string }) {
  const artwork = kind === "website" || kind === "app" ? "software" : kind;
  return <Image src={`/studios/${artwork}.svg`} alt="" width={540} height={300}
    style={{ width: "100%", height: "auto", borderRadius: 16, marginBottom: 20 }} />;
}
