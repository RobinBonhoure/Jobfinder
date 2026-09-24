import { getClusterDetail } from "@jobhunt/core/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobDetail } from "@/components/job-detail";

export default async function JobPage({ params }: PageProps<"/jobs/[clusterId]">) {
  const { clusterId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(clusterId)) notFound();
  const detail = await getClusterDetail(clusterId);
  if (!detail?.canonical) notFound();

  return (
    <div>
      <div className="mx-auto max-w-3xl px-8 pt-5">
        <Link href={`/?sel=${clusterId}`} className="text-xs text-ink-3 hover:text-ink hover:underline">
          ← Inbox
        </Link>
      </div>
      <JobDetail detail={detail} />
    </div>
  );
}
