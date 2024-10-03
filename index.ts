#!/usr/bin/env node

import fs from "fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import { Command } from "commander";
import yaml from "js-yaml";

interface CommandConfig {
  command: string;
  args?: string[];
  env?: { [key: string]: string };
  restart_on_fail?: boolean;
}

interface Config {
  env?: { [key: string]: string };
  commands: { [name: string]: CommandConfig };
}

const program = new Command();

program
  .option("-c, --config <path>", "Specify path to config.yaml", "config.yaml")
  .option("-d, --detach", "Run the command in the background");

program.parseOptions(process.argv);
const options = program.opts();

const configFile = path.resolve(process.cwd(), options.config);

let config: Config;
let defaultEnv: { [key: string]: string } = {};

try {
  if (!fs.existsSync(configFile)) {
    console.error(`Configuration file not found at ${configFile}`);
    process.exit(1);
  }

  const configContent = fs.readFileSync(configFile, "utf8");
  config = yaml.load(configContent) as Config;

  if (config.env) {
    defaultEnv = config.env;
  }
} catch (e: any) {
  console.error("Failed to load configuration file:", e.message);
  process.exit(1);
}

const commandsConfig = config.commands;

const childProcesses: { [name: string]: ChildProcessWithoutNullStreams } = {};

program
  .command("start [commandName]")
  .description("Start a process or all processes if no command is specified")
  .action((commandName) => {
    const options = program.opts();
    startProcesses(commandName, options.detach);
  });

program
  .command("stop [commandName]")
  .description("Stop a process or all processes if no command is specified")
  .action(stopProcesses);

program
  .command("restart [commandName]")
  .description("Restart a process or all processes if no command is specified")
  .action((commandName) => {
    const options = program.opts();
    restartProcesses(commandName, options.detach);
  });

program
  .command("status [commandName]")
  .description(
    "Check the status of a process or all processes if no command is specified"
  )
  .action(checkStatus);

program.command("list").description("List all processes").action(listProcesses);

program
  .command("logs <commandName>")
  .description("Show logs of a process")
  .option("-f, --follow", "Follow the log output (like tail -f)")
  .option(
    "-n, --lines <number>",
    "Number of lines to show from the end of the log file",
    "10"
  )
  .action(showLogs);

program
  .command("inspect <commandName>")
  .description("Display detailed information about a process")
  .action(inspectProcess);

program.parse(process.argv);

function startProcesses(name?: string, detach?: boolean) {
  const servicesToStart = name ? [name] : Object.keys(commandsConfig);

  for (const serviceName of servicesToStart) {
    startProcess(serviceName, detach);
  }

  if (Object.keys(childProcesses).length > 0) {
    if (!detach) {
      console.log("Services started. Press Ctrl+C to exit.");
      process.stdin.resume();
    } else {
      console.log("Services started in the background.");
    }
  } else {
    console.log("No services to start.");
  }
}

function startProcess(name: string, detach?: boolean) {
  const cmdConfig = commandsConfig[name];
  if (!cmdConfig) {
    console.error(`Command '${name}' not found in configuration.`);
    return;
  }

  if (childProcesses[name] || isProcessRunning(name)) {
    console.log(`Process '${name}' is already running.`);
    return;
  }

  const pidFile = path.resolve(process.cwd(), `${name}.pid`);
  const logFile = path.resolve(process.cwd(), `${name}.log`);

  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  const envVars: NodeJS.ProcessEnv = {
    ...process.env,
    ...defaultEnv,
    ...(cmdConfig.env || {}),
  };

  const substitutedArgs = (cmdConfig.args || []).map((arg: string) => {
    return arg.replace(
      /\$\{(\w+)\}/g,
      (_match: string, varName: string) => envVars[varName] || ""
    );
  });

  const spawnOptions: any = {
    stdio: ["ignore", out, err],
    env: envVars,
  };

  if (detach) {
    spawnOptions.detached = true;
  }

  const child = spawn(cmdConfig.command, substitutedArgs, spawnOptions);

  childProcesses[name] = child;

  if (child.pid !== undefined) {
    fs.writeFileSync(pidFile, child.pid.toString());
    console.log(`Started '${name}' with PID ${child.pid}`);
  } else {
    console.error(`Failed to start '${name}': PID is undefined.`);
  }

  child.on("exit", (code, signal) => {
    console.log(
      `Process '${name}' exited with code ${code} and signal ${signal}`
    );
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    delete childProcesses[name];

    if (cmdConfig.restart_on_fail) {
      console.log(`Restarting '${name}' due to failure...`);
      startProcess(name, detach);
    }
  });

  if (detach) {
    child.unref();
  }
}

function isProcessRunning(name: string): boolean {
  const pidFile = path.resolve(process.cwd(), `${name}.pid`);
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
    if (isRunning(pid)) {
      return true;
    } else {
      fs.unlinkSync(pidFile);
    }
  }
  return false;
}

function stopProcesses(name?: string) {
  const servicesToStop = name ? [name] : Object.keys(commandsConfig);

  for (const serviceName of servicesToStop) {
    stopProcess(serviceName);
  }
}

function stopProcess(name: string) {
  const pidFile = path.resolve(process.cwd(), `${name}.pid`);

  if (!fs.existsSync(pidFile)) {
    console.log(`No PID file found for '${name}'. Process not running?`);
    return;
  }
  const pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);

  try {
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(pidFile);
    console.log(`Stopped '${name}' with PID ${pid}`);

    if (childProcesses[name]) {
      childProcesses[name].kill("SIGTERM");
      delete childProcesses[name];
    }
  } catch (err) {
    console.error(`Error stopping '${name}' with PID ${pid}:`, err);
  }
}

function restartProcesses(name?: string, detach?: boolean) {
  const servicesToRestart = name ? [name] : Object.keys(commandsConfig);

  for (const serviceName of servicesToRestart) {
    stopProcess(serviceName);
    startProcess(serviceName, detach);
  }
}

function checkStatus(name?: string) {
  const servicesToCheck = name ? [name] : Object.keys(commandsConfig);

  for (const serviceName of servicesToCheck) {
    const pidFile = path.resolve(process.cwd(), `${serviceName}.pid`);
    if (!fs.existsSync(pidFile)) {
      console.log(`Process '${serviceName}' not running.`);
      continue;
    }
    const pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
    if (isRunning(pid)) {
      console.log(`Process '${serviceName}' is running with PID ${pid}`);
    } else {
      console.log(`Process '${serviceName}' not running.`);
      fs.unlinkSync(pidFile);
    }
  }
}

function listProcesses() {
  console.log("Listing all processes:");
  for (const name of Object.keys(commandsConfig)) {
    const pidFile = path.resolve(process.cwd(), `${name}.pid`);
    let status = "stopped";
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
      if (isRunning(pid)) {
        status = `running (PID ${pid})`;
      } else {
        fs.unlinkSync(pidFile);
      }
    }
    console.log(`- ${name}: ${status}`);
  }
}

function showLogs(name: string, options: { follow?: boolean; lines?: string }) {
  const logFile = path.resolve(process.cwd(), `${name}.log`);

  if (!fs.existsSync(logFile)) {
    console.log(`Log file for '${name}' does not exist.`);
    return;
  }

  const numberOfLines = parseInt(options.lines || "10", 10);

  if (options.follow) {
    const tail = spawn(
      "tail",
      ["-f", "-n", numberOfLines.toString(), logFile],
      {
        stdio: "inherit",
      }
    );

    tail.on("error", (err) => {
      console.error("Failed to start tail process:", err.message);
    });
  } else {
    fs.readFile(logFile, "utf8", (err, data) => {
      if (err) {
        console.error(`Error reading log file: ${err.message}`);
        return;
      }
      const lines = data.trim().split("\n");
      const lastLines = lines.slice(-numberOfLines);
      console.log(lastLines.join("\n"));
    });
  }
}

function inspectProcess(name: string) {
  const cmdConfig = commandsConfig[name];
  if (!cmdConfig) {
    console.error(`Command '${name}' not found in configuration.`);
    return;
  }

  const serviceConfig = {
    name: name,
    ...cmdConfig,
  };

  const pidFile = path.resolve(process.cwd(), `${name}.pid`);
  let status = "stopped";
  let pid: number | null = null;
  if (fs.existsSync(pidFile)) {
    pid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
    if (isRunning(pid)) {
      status = "running";
    } else {
      fs.unlinkSync(pidFile);
      pid = null;
    }
  }

  const combinedEnv = {
    ...defaultEnv,
    ...(cmdConfig.env || {}),
  };

  const inspectionData = {
    name: name,
    status: status,
    pid: pid,
    config: serviceConfig,
    globalEnv: defaultEnv,
    combinedEnv: combinedEnv,
  };

  console.log(JSON.stringify(inspectionData, null, 2));
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

process.on("SIGINT", () => {
  console.log("Shutting down...");
  stopProcesses();
  process.exit();
});
