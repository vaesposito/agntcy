export function AgntcyFooter() {
  return (
    <footer className="border-t border-[#0d274d] px-8 py-10 md:px-[90px] lg:pl-[200px] lg:pr-[150px] 3xl:pl-[260px] 3xl:pr-[200px] 3xl:py-14">
      <div className="flex flex-col gap-3 text-xs leading-relaxed text-white/55 md:text-sm 3xl:gap-4 3xl:text-lg">
        <p>Copyright &copy; AGNTCY a Series of LF Projects, LLC</p>
        <p>
          For web site terms of use, trademark policy and other project policies
          please see{" "}
          <a
            href="https://lfprojects.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#187adc] transition-colors duration-200 hover:text-[#fbaf45]"
          >
            https://lfprojects.org
          </a>
          .
        </p>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2 3xl:mt-2">
          <a
            href="https://lfprojects.org/policies/terms-of-use/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[linear-gradient(#fbaf45,#fbaf45)] bg-[length:0%_1px] bg-[position:0_100%] bg-no-repeat pb-0.5 text-white/70 transition-[color,background-size] duration-200 hover:bg-[length:100%_1px] hover:text-[#fbaf45]"
          >
            Terms &amp; Conditions
          </a>
          <a
            href="https://lfprojects.org/policies/privacy-policy/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[linear-gradient(#fbaf45,#fbaf45)] bg-[length:0%_1px] bg-[position:0_100%] bg-no-repeat pb-0.5 text-white/70 transition-[color,background-size] duration-200 hover:bg-[length:100%_1px] hover:text-[#fbaf45]"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </footer>
  );
}
