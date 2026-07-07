import Link from "next/link";

const rows = [
  {
    name: "prod-db-primary",
    type: "Bare Metal",
    region: "ap-south-1",
    status: "Running",
    statusColor: "#16A34A",
    cost: "$4,200",
  },
  {
    name: "prod-db-replica",
    type: "Bare Metal",
    region: "ap-south-1",
    status: "Running",
    statusColor: "#16A34A",
    cost: "$4,200",
  },
  {
    name: "inference-cluster",
    type: "GPU / AI",
    region: "us-east-1",
    status: "Running",
    statusColor: "#16A34A",
    cost: "$8,100",
  },
  {
    name: "staging-hybrid",
    type: "Hybrid",
    region: "eu-west-1",
    status: "Scaling",
    statusColor: "#D97706",
    cost: "$1,340",
  },
  {
    name: "dev-sandbox",
    type: "Cloud",
    region: "us-east-1",
    status: "Stopped",
    statusColor: "#3D3D3D",
    cost: "$0",
  },
];

type ArchPreviewSectionProps = {
  id?: string;
  docsHref?: string;
};

export default function ArchPreviewSection({
  id,
  docsHref = "/platform",
}: ArchPreviewSectionProps) {
  return (
    <section id={id} className="bg-bg-900 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-10 px-4 sm:gap-12 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-16 xl:gap-20 xl:px-8">
        <div>
          <p
            className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-crimson-500"
          >
            ARCHITECTURE
          </p>
          <h2 className="mb-6 mt-3 font-sans text-[clamp(1.75rem,4vw,2.75rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-bg-50 md:text-[44px]">
            One governed plane. Every workload.
          </h2>
          <p className="mb-10 max-w-[520px] text-base font-normal leading-[1.7] text-bg-400">
            Racko&apos;s unified operations layer gives consistent visibility,
            policy enforcement, and cost attribution - whether the workload runs
            on private hardware, cloud, or AI compute.
          </p>
          <Link
            href={docsHref}
            className="font-mono cursor-pointer border-none bg-transparent p-0 text-[13px] font-medium text-bg-400 transition-colors duration-200 hover:text-crimson-500"
          >
            View full architecture docs -&gt;
          </Link>
        </div>

        <div className="overflow-hidden rounded-[6px] border border-[rgba(255,255,255,0.08)] bg-bg-950">
          <div className="flex h-9 items-center justify-between border-b border-[rgba(255,255,255,0.08)] bg-bg-800 px-4">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-bg-600" />
              <span className="h-1.5 w-1.5 rounded-full bg-bg-600" />
              <span className="h-1.5 w-1.5 rounded-full bg-bg-600" />
            </div>
            <p className="font-mono text-[10px] font-normal text-bg-500">
              racko - unified ops plane
            </p>
            <span className="w-[30px]" />
          </div>

          <div className="flex">
            <aside className="hidden w-40 shrink-0 border-r border-[rgba(255,255,255,0.08)] bg-bg-900 px-4 py-4 sm:block">
              <div className="font-mono flex flex-col gap-8 text-[9px] font-normal text-[#6B6B6B]">
                <p className="text-crimson-500">&gt; Workloads</p>
                <p>Networking</p>
                <p>Storage</p>
                <p>Compute</p>
                <p>Governance</p>
                <p>Observability</p>
                <p>Settings</p>
              </div>
            </aside>

            <div className="min-w-0 flex-1 p-5">
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-bg-800 p-[14px]">
                  <p className="font-mono text-[9px] font-normal text-bg-500">
                    ENVIRONMENTS
                  </p>
                  <p className="mt-2 font-sans text-[22px] font-bold text-bg-50">12</p>
                </div>
                <div className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-bg-800 p-[14px]">
                  <p className="font-mono text-[9px] font-normal text-bg-500">
                    WORKLOADS
                  </p>
                  <p className="mt-2 font-sans text-[22px] font-bold text-bg-50">94</p>
                </div>
                <div className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-bg-800 p-[14px]">
                  <p className="font-mono text-[9px] font-normal text-bg-500">
                    GOVERNANCE
                  </p>
                  <p className="mt-2 font-sans text-[22px] font-bold text-crimson-500">
                    98/100
                  </p>
                </div>
              </div>

              <div className="overflow-hidden no-scrollbar">
                <table className="w-full table-fixed border-collapse">
                  <thead>
                    <tr
                      className="font-mono border-b border-[rgba(255,255,255,0.08)] text-left text-[8px] font-medium uppercase text-bg-500"
                    >
                      <th className="w-[30%] px-2 py-2">Name</th>
                      <th className="w-[18%] px-2 py-2">Type</th>
                      <th className="w-[18%] px-2 py-2">Region</th>
                      <th className="w-[18%] px-2 py-2">Status</th>
                      <th className="w-[16%] px-2 py-2">Cost/Mo</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[9px] font-normal text-bg-200">
                    {rows.map((row, idx) => (
                      <tr
                        key={row.name}
                        className={
                          idx % 2 === 0
                            ? "bg-bg-900/60"
                            : "bg-transparent"
                        }
                      >
                        <td className="w-[30%] px-2 py-2">{row.name}</td>
                        <td className="w-[18%] px-2 py-2">{row.type}</td>
                        <td className="w-[18%] px-2 py-2">{row.region}</td>
                        <td className="w-[18%] px-2 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: row.statusColor }}
                            />
                            {row.status}
                          </span>
                        </td>
                        <td className="w-[16%] px-2 py-2">{row.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
