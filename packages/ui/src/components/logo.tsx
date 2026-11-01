import { type ComponentProps } from "solid-js"

// DeV's mark: a D with a v in its bowl, ink on saffron (packages/identity/mark.svg).
const MarkShapes = () => (
  <>
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#F2A516" />
    <path d="M18 16h12c10 0 17 7 17 16s-7 16-17 16H18z" stroke="#121317" stroke-width="5" stroke-linejoin="round" />
    <path d="M26 27l5 9 5-9" stroke="#121317" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
  </>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <MarkShapes />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <MarkShapes />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 90 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z" fill="var(--icon-strong-base)" />
        <path d="M48 24V30H36V24H48Z" fill="var(--icon-weak-base)" />
        <path d="M54 24H36V30H54V36H30V6H54V24ZM36 18H48V12H36V18Z" fill="var(--icon-strong-base)" />
        <path d="M66 6V24H72V30H78V24H84V6H90V27H84V33H78V36H72V33H66V27H60V6H66Z" fill="#F2A516" />
      </g>
    </svg>
  )
}
