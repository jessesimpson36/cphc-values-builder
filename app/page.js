'use client'

import Image from 'next/image'
import { Button,
  Grid,
  Column,
  Checkbox,
  CheckboxGroup,
  CodeSnippet,
  TextInput,
  RadioButton,
  RadioButtonGroup,
  Heading,
  Tooltip,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@carbon/react';
import { Information } from '@carbon/icons-react';
import { ChangeEvent, useState, useRef, useEffect } from "react";
import { createPortal } from 'react-dom';
import './page.scss';

function LoadModalAfterMount(props) {
  if (!props.display) {
    return null;
  }
  var ModalStateManager = ({
      renderLauncher: LauncherContent,
      children: ModalContent
    }) => {
      const [open, setOpen] = useState(false);
      return <>
          {!ModalContent || createPortal(<ModalContent open={open} setOpen={setOpen} />, document.body)}
          {LauncherContent && <LauncherContent open={open} setOpen={setOpen} />}
        </>;
    };
  return (
            <ModalStateManager
              renderLauncher={({ setOpen }) => (
                <Button ref={props.button} onClick={() => setOpen(true)}>
                  <Information /> Help
                </Button>
              )}
            >
              {({ open, setOpen }) => (
                <ComposedModal open={open} onClose={() => setOpen(false)}>
                  <ModalHeader
                    label="Account resources"
                    title="Install an Ingress Controller"
                  />
                  <ModalBody>
                    If you do not know what an ingress class is, and have not
                    yet installed one, save the following as
                    nginx_ingress_values.yaml
                    <CodeSnippet type="multi">
                      {`controller:
  ingressClassResource:
    default: true
  replicaCount: 1
  admissionWebhooks:
    enabled: false
  hostNetwork: true`}
                      {props.deploymentType == "local" &&
                        `
  service:
    type: NodePort`}
                      {props.deploymentType == "remote" &&
                        `
  service:
    type: LoadBalancer`}
                    </CodeSnippet>
                    And then run the following command to install the Nginx
                    Ingress Controller:
                    <CodeSnippet type="multi">
                      {`helm install -f nginx_ingress_values.yaml nginx-ingress oci://ghcr.io/nginxinc/charts/nginx-ingress --version 0.17.1`}
                    </CodeSnippet>
                  </ModalBody>
                </ComposedModal>
              )}
            </ModalStateManager>);
}

export default function Home() {
  
  const [inputText, setInputText ] = useState("");
  const [baseUrl, setBaseUrl ] = useState("");
  const [ingressType, setIngressType ] = useState("combined");
  const [deploymentType, setDeploymentType ] = useState("remote");

  const [identityEnabled, handleToggleIdentity] = useState(true);
  const [tasklistEnabled, handleToggleTasklist] = useState(true);
  const [operateEnabled, handleToggleOperate] = useState(true);
  const [optimizeEnabled, handleToggleOptimize] = useState(false);
  const [connectorsEnabled, handleToggleConnectors] = useState(true);
  const [zeebeEnabled, handleToggleZeebe] = useState(true);
  const [modelerEnabled, handleToggleModeler] = useState(false);
  const [ingressClassName, handleIngressClass] = useState("");
  const [pullSecret, handlePullSecrets] = useState("");
  const [tlsSecret, handleTLSSecrets] = useState("");
  const [tlsEnabled, handleTLSEnabled] = useState("http");
  const [display, setDisplay] = useState(false);
  const button = useRef();
  var ModalStateManager = () => null;

  useEffect(() => {
    setDisplay(true);

  }, []);


  const handleRepositoryChange = e => {
    setInputText(e.target.value);
  };

  const handleBaseUrlChange = e => {
    setBaseUrl(e.target.value);
  };

  const handleIngressTypeChange = e => {
    console.log(e);
    setIngressType(e);
  };

  const handleDeploymentTypeChange = e => {
    setDeploymentType(e);
  };

  const toggleZeebe = e => {
    handleToggleZeebe(e.target.checked);
  };


  const toggleOperate = e => {
    handleToggleOperate(e.target.checked);
  };

  const toggleConnectors = e => {
    handleToggleConnectors(e.target.checked);
  };

  const toggleOptimize = e => {
    handleToggleOptimize(e.target.checked);
  };


  const toggleTasklist = e => {
    handleToggleTasklist(e.target.checked);
  };

  const toggleIdentity = e => {
    handleToggleIdentity(e.target.checked);
  };

  const toggleModeler = e => {
    handleToggleModeler(e.target.checked);
  };

  const handleIngressClassNameChange = e => {
    handleIngressClass(e.target.value);
  };

  const handlePullSecretsChange = e => {
    handlePullSecrets(e.target.value);
  };

  const handleTLSSecretChange = e => {
    handleTLSSecrets(e.target.value);
    handleTLSEnabled(e.target.value == "" ? "http" : "https");
  };

  return (
    <div>
      <Heading>Camunda Platform values.yaml creator</Heading>
      <br />
      <br />
      <div className="cds--grid">
        <div className="cds--row">
          <div className="cds--col">
            <CodeSnippet type="multi" minCollapsedNumberOfRows={110}>
  {`
global:`}
{ (inputText != '' || pullSecret != '') && `
  image:`}
{ inputText != '' && `
    registry: ${inputText}`}
{ pullSecret != '' && `
    pullSecret: 
      - name: ${pullSecret}`}
{ (ingressType == 'separated' && baseUrl != '') && `
  identity:
    auth:
      publicIssuerUrl: "${tlsEnabled}://keycloak.${baseUrl}/auth/realms/camunda-platform"
      operate:
        redirectUrl: "${tlsEnabled}://operate.${baseUrl}"
      optimize:
        redirectUrl: "${tlsEnabled}://optimize.${baseUrl}"
      tasklist:
        redirectUrl: "${tlsEnabled}://tasklist.${baseUrl}"
      webModeler:
        redirectUrl: "${tlsEnabled}://modeler.${baseUrl}"`}
{ (ingressType == 'combined' && baseUrl != '') && `
  ingress:
    enabled: true
    className: ${ingressClassName}
    host: ${baseUrl}`}
{ (ingressType == 'combined' && baseUrl != '' && tlsSecret != '') && `
    tls:
      enabled: true
      secretName: ${tlsSecret}`}
{ (ingressType == 'combined' && baseUrl != '') && `
  identity:
    auth:
      publicIssuerUrl: "${tlsEnabled}://${baseUrl}/auth/realms/camunda-platform"
      operate:
        redirectUrl: "${tlsEnabled}://${baseUrl}/operate"
      optimize:
        redirectUrl: "${tlsEnabled}://${baseUrl}/optimize"
      tasklist:
        redirectUrl: "${tlsEnabled}://${baseUrl}/tasklist"
      webModeler:
        redirectUrl: "${tlsEnabled}://${baseUrl}/modeler"`}
{`
`}
{`
zeebe:
  enabled: ${zeebeEnabled}`}
{(zeebeEnabled && deploymentType == 'local') && `
  clusterSize: "1"
  partitionCound: "1"
  replicationFactor: "1"`}
{`
`}
{`
operate:
  enabled: ${operateEnabled}`}
{(operateEnabled && ingressType == 'combined') && `
  contextPath: "/operate"`
}
{(ingressType == 'separated' && baseUrl != '' && operateEnabled) && `
  ingress:
    enabled: true
    className: ${ingressClassName}
    host: operate.${baseUrl}`}
{(ingressType == 'separated' && baseUrl != '' && tlsSecret != '' && operateEnabled) && `
    tls:
      enabled: true
      secretName: ${tlsSecret}`}
{`
`}
{`
connectors:
  enabled: ${connectorsEnabled}`}
{connectorsEnabled && ingressType == 'combined' && `
  contextPath: "/connectors"`}
{`
`}
{`
tasklist:
  enabled: ${tasklistEnabled}`}
{(tasklistEnabled && ingressType == 'combined') && `
  contextPath: "/tasklist"`
}
{(ingressType == 'separated' && baseUrl != '' && tasklistEnabled) && `
  ingress:
    enabled: true
    className: ${ingressClassName}
    host: tasklist.${baseUrl}`}
{(ingressType == 'separated' && baseUrl != '' && tlsSecret != '' && tasklistEnabled) && `
    tls:
      enabled: true
      secretName: ${tlsSecret}`}
{`
`}
{`
optimize:
  enabled: ${optimizeEnabled}`}
{(optimizeEnabled && ingressType == 'combined') && `
  contextPath: "/optimize"`
}
{(ingressType == 'separated' && baseUrl != '' && optimizeEnabled) && `
  ingress:
    enabled: true
    className: ${ingressClassName}
    host: optimize.${baseUrl}`}
{(ingressType == 'separated' && baseUrl != '' && tlsSecret != '' && optimizeEnabled) && `
    tls:
      enabled: true
      secretName: ${tlsSecret}`}
{`
`}
{`
identity:
  enabled: ${identityEnabled}`}
{(ingressType == 'combined' && baseUrl != '' && identityEnabled) && `
  contextPath: "/identity"
  fullURL: "${tlsEnabled}://${baseUrl}/identity"`}
{(ingressType == 'separated' && baseUrl != '' && identityEnabled) && `
  ingress:
    enabled: true
    className: ${ingressClassName}
    host: identity.${baseUrl}`}
{(ingressType == 'separated' && baseUrl != '' && tlsSecret != '' && identityEnabled) && `
    tls:
      enabled: true
      secretName: ${tlsSecret}`}
{ingressType == 'separated' && baseUrl != '' && identityEnabled && `
  fullURL: "${tlsEnabled}://identity.${baseUrl}"
  keycloak:
    proxy: edge
    ingress:
      enabled: true
      ingressClassName: ${ingressClassName}
      hostname: keycloak.${baseUrl}`}
{ingressType == 'separated' && baseUrl != '' && tlsSecret != '' && identityEnabled && `
      extraTls:
        - hosts:
          - keycloak.${baseUrl}
          secretName: ${tlsSecret}`}
{`
`}
{`
postgresql:
  enabled: ${modelerEnabled}

webModeler:
  enabled: ${modelerEnabled}`}
{(modelerEnabled && ingressType == 'combined') && `
  contextPath: "/modeler"`
}
{modelerEnabled && `
  restapi:
    mail:
      fromAddress: fake@fake.com`}
{ ingressType == 'separated' && baseUrl != '' && tlsSecret != '' && modelerEnabled && `
  webapp:
    host: modeler.${baseUrl}
    tls:
      enabled: true
      secretName: ${tlsSecret}`}
{ ingressType == 'separated' && baseUrl != '' && tlsSecret != '' && modelerEnabled && `
  websockets:
    host: modeler.${baseUrl}
    tls:
      enabled: true
      secretName: ${tlsSecret}`}
{`
`}
{ zeebeEnabled && `
zeebe-gateway:`}
{ ingressType != 'none' && ingressType != '' && zeebeEnabled && `
  ingress:
    enabled: ${zeebeEnabled}`}
{ ingressType != 'none' &&  ingressType != '' && zeebeEnabled && ingressClassName != '' && `
    className: ${ingressClassName}`}
{zeebeEnabled && baseUrl != '' && ingressType != 'none' &&  ingressType != '' && `
    host: zeebe.${baseUrl}`}
{(zeebeEnabled && deploymentType == 'local' ) && `
  replicas: 1`}
{`
`}
{deploymentType == 'local' && `
elasticsearch:
  clusterHealthCheckParams: "wait_for_status=yellow&timeout=1s"
  replicas: 1
  antiAffinity: "soft"`}
            </CodeSnippet>
          </div>
          <div className="cds--col">
            <TextInput
              helperText="Base url without http:// or https://"
              id="base_url"
              invalidText="invalid base url"
              labelText="Base url for each component"
              placeholder="local.distro.ultrawombat.com"
              onChange={handleBaseUrlChange}
            />
            <br />
            <TextInput
              helperText="Private registry hostname"
              id="registry_hostname"
              invalidText="invalid"
              labelText="Registry hostname"
              placeholder="quay.io/camunda"
              onChange={handleRepositoryChange}
            />
            <br />
            <RadioButtonGroup
              name="deployment_type"
              legendText="Deployment type"
              id="deployment_type"
              onChange={handleDeploymentTypeChange}
              defaultSelected="remote">
              <RadioButton labelText="Local" value="local" id="local" />
              <RadioButton labelText="Remote" value="remote" id="remote" />
            </RadioButtonGroup>
            <br />
            <RadioButtonGroup
              name="ingress_type"
              legendText="Ingress Type"
              id="ingress_type"
              onChange={handleIngressTypeChange}
              defaultSelected="combined">
              <RadioButton labelText="None" value="none" id="radio-none" />
              <RadioButton labelText="Combined" value="combined" id="radio-combined" />
              <RadioButton labelText="Separated" value="separated" id="radio-separated" />
            </RadioButtonGroup>
            <br />
            <CheckboxGroup legendText="Enable Components" helperText="Enable Components">
              <Checkbox id="zeebeEnabled" labelText="Zeebe" defaultChecked={true} onChange={toggleZeebe} />
              <Checkbox id="connectorsEnabled" labelText="Connectors" defaultChecked={true} onChange={toggleConnectors} />
              <Checkbox id="operateEnabled" labelText="Operate" defaultChecked={true} onChange={toggleOperate} />
              <Checkbox id="tasklistEnabled" labelText="Tasklist" defaultChecked={true} onChange={toggleTasklist} />
              <Checkbox id="optimizeEnabled" labelText="Optimize" defaultChecked={false} onChange={toggleOptimize} />
              <Checkbox id="identityEnabled" labelText="Identity" defaultChecked={true} onChange={toggleIdentity} />
              <Checkbox id="modelerEnabled" labelText="Web Modeler" defaultChecked={false} onChange={toggleModeler} />
            </CheckboxGroup>
            <br />
            <TextInput
              helperText="Ingress Class Name"
              id="ingress_class_name"
              invalidText="invalid"
              labelText="Ingress Class Name"
              placeholder="nginx"
              onChange={handleIngressClassNameChange}
            />
            <Tooltip align="bottom" label={"The name of the IngressClass kubernetes resource. Set up an Ingress Controller if you do not have any available IngressClass's yet."}>
              <button className="sb-tooltip-trigger" type="button" >
                <Information />
              </button>
            </Tooltip>

            <LoadModalAfterMount display={display} deploymentType={deploymentType} button={button} />

            <br />
            <br />
            <TextInput
              helperText="Pull Secrets"
              id="pull_secrets"
              invalidText="invalid"
              labelText="Name of kubernetes secret with docker registry credentials"
              placeholder="registry-camunda-cloud"
              onChange={handlePullSecretsChange}
            />
            <Tooltip align="bottom" label={"Create a TLS secret with `kubectl create secret docker-registry <name> --docker-server=<host> --docker-username=<username> --docker-password=<password>` and enter the name of the secret here. "}>
              <button className="sb-tooltip-trigger" type="button">
                <Information />
              </button>
            </Tooltip>
            <br />
            <br />
            <TextInput
              helperText="Name of TLS Secret"
              id="tls_secret_name"
              invalidText="invalid"
              labelText="Name of TLS Secret"
              placeholder="local-distro-ultrawombat-tls"
              onChange={handleTLSSecretChange}
            />
            <Tooltip align="bottom" label={"Create a TLS secret with `kubectl create secret tls <name> --cert=<path_to_cert> --key=<path_to_key>` and enter the name of the secret here.  This will also change all urls to https"}>
              <button className="sb-tooltip-trigger" type="button">
                <Information />
              </button>
            </Tooltip>
            <br />
            <br />
            <br />
            <Heading>What now?</Heading>
            <p>
              The options above represents a basic installation. If you have deployed the
              helm chart and the application functions, then you can move onto more advanced
              options. Our options are documented in the
            </p>
            <a href="https://github.com/camunda/camunda-platform-helm/tree/main/charts/camunda-platform">
              Camunda Platform Helm Chart Repository in GitHub
            </a>
            <p>
              and more component-specific options may be found in
            </p>
            <a href="https://docs.camunda.io/docs/self-managed/platform-deployment/helm-kubernetes/deploy">
              Camunda Platform Docs
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
