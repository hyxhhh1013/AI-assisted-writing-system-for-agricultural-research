import { redirect } from "next/navigation";

/** /directions 重定向到主页（研究方向概览已集成到主页） */
export default function DirectionsPage() {
  redirect("/");
}
