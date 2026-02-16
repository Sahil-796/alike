declare module 'swagger-ui-react' {
  interface SwaggerUIProps {
    spec: Record<string, any>;
    url?: string;
    layout?: string;
    docExpansion?: string;
  }
  
  export default function SwaggerUI(props: SwaggerUIProps): JSX.Element;
}
