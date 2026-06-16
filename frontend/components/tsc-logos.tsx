import { withBase } from "@/lib/site";
import { urlForLogo } from "@/lib/company-urls";

export const TSC_MEMBERS = [
  { name: "Cisco", logo: "/agntcy/logos/cisco.png" },
  { name: "Dell Technologies", logo: "/agntcy/logos/dell.png" },
  { name: "Google Cloud", logo: "/agntcy/logos/google.png" },
  { name: "Oracle", logo: "/agntcy/logos/oracle.png" },
  { name: "Red Hat", logo: "/agntcy/logos/redhat.png" },
];

const CHIP_BASE =
  "flex h-20 items-center justify-center rounded-[16px] border border-[#0d274d] bg-[#00142b] px-5 shadow-[0px_4px_30px_#0d274d] 3xl:h-28 3xl:rounded-[22px] 3xl:px-7";

export function TscLogos() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 3xl:mt-8 3xl:gap-6">
      {TSC_MEMBERS.map((member) => {
        const href = urlForLogo(member.logo);
        const img = (
          <img
            src={withBase(member.logo)}
            alt={member.name}
            loading="lazy"
            className="max-h-9 w-auto max-w-full object-contain 3xl:max-h-14"
          />
        );

        if (!href) {
          return (
            <div
              key={member.name}
              className={`${CHIP_BASE} transition-shadow duration-300 hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)]`}
            >
              {img}
            </div>
          );
        }

        return (
          <a
            key={member.name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={member.name}
            aria-label={`${member.name} — open website in a new tab`}
            className={`${CHIP_BASE} cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:border-[#187adc] hover:shadow-[0px_8px_50px_rgba(24,122,220,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#187adc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#00142b]`}
          >
            {img}
          </a>
        );
      })}
    </div>
  );
}
