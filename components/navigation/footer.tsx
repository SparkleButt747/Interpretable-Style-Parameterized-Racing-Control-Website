import Image from "next/image"
import Link from "next/link"

import { Settings } from "@/types/settings"
import { withBasePath } from "@/lib/utils"

export function Footer() {
  const footerLogo = withBasePath("/logo.svg")

  return (
    <footer className="text-foreground flex h-16 w-full flex-wrap items-center justify-center gap-4 border-t px-2 py-3 text-sm sm:justify-between sm:gap-0 sm:px-4 sm:py-0 lg:px-8">
      <p className="items-center">
        &copy; {new Date().getFullYear()}{" "}
        <Link
          title={Settings.name}
          aria-label={Settings.name}
          className="font-semibold"
          href={Settings.link}
        >
          {Settings.name}
        </Link>
        .
      </p>
      {Settings.branding !== false && (
        <div className="hidden items-center md:block">
          <Link
            className="font-semibold"
            href="https://github.com/SparkleButt747"
            title="Randev Ranjit"
            aria-label="Randev Ranjit"
            target="_blank"
          >
            <Image
              src={footerLogo}
              alt="SB747"
              title="SB747"
              aria-label="SB747"
              priority={false}
              width={30}
              height={30}
            />
          </Link>
        </div>
      )}
    </footer>
  )
}
