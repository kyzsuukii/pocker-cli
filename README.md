# Pocker

Pocker is a simple process management tool designed to manage multiple processes in a single terminal. It streamlines the task of running and controlling multiple processes simultaneously, offering an efficient alternative to juggling multiple terminal windows.

The name "Pocker" is inspired by Docker, but unlike Docker, Pocker is not a containerization tool. Instead, it focuses on straightforward process management and control.

## Installation

Install Pocker globally using npm:

```bash
npm install -g pocker-cli
```

## Usage

To see all available commands and options:

```bash
pocker --help
```

By default, Pocker looks for a `pocker.json` configuration file in the current directory.

## Commands

- `start`: Initialize and run the processes defined in the config file.
- `stop`: Terminate the processes defined in the config file.
- `restart`: Stop and then start the processes defined in the config file.
- `list`: Display a list of all processes defined in the config file.
- `status`: Show the current status of all processes defined in the config file.
- `logs`: Retrieve and display logs for the processes defined in the config file.
- `inspect`: Provide detailed information about the processes defined in the config file.

## Options

- `-c, --config <path>`: Specify a custom path for the configuration file.
- `-d, --detach`: Run the processes in the background (detached mode).

## Configuration File

Pocker uses a YAML configuration file to define the processes it manages and their environment. Here's an example configuration file with explanations:

```yaml
env:
  ADDRESS: 127.0.0.1

commands:
  http-server:
    command: "python"
    args: ["-m", "http.server", "-b", "${ADDRESS}", "${PORT}"]
    env:
      PORT: 8080
    working_dir: "/path/to/project"
    log_file: "/path/to/logs/http-server.log"
    restart_on_fail: true
```

Let's break down the structure and options:

1. `env`: This section defines global environment variables that can be used across all commands.
   - `ADDRESS: 127.0.0.1`: Sets a global variable `ADDRESS` to the loopback IP address.

2. `commands`: This section defines the processes that Pocker will manage.
   - `http-server`: This is the name of the process. You can define multiple processes under the `commands` section.

3. Process configuration:
   - `command`: The main command to execute (in this case, "python").
   - `args`: An array of arguments passed to the command. Note the use of variable substitution (`${ADDRESS}` and `${PORT}`).
   - `env`: Environment variables specific to this process. These override global variables if there's a name conflict.
   - `working_dir`: The working directory for the process. If not specified, Pocker uses the current directory.
   - `log_file`: The path to the log file for this process.
   - `restart_on_fail`: A boolean flag indicating whether Pocker should automatically restart the process if it fails.

### Variable Substitution

Pocker supports variable substitution in the configuration file. You can use `${VARIABLE_NAME}` syntax to reference:
- Global environment variables defined in the `env` section
- Process-specific environment variables defined in the process's `env` section
- System environment variables

### TODO: Future Configuration Options

In future versions, Pocker may support additional configuration options for each process, such as:

- ~~Custom working directory~~
- ~~Custom log file paths~~
- Detached mode configuration
- Process priority settings

These features are not yet implemented but are being considered for future releases.

## Example Usage

1. Save the above configuration as `pocker.json` in your project directory.

2. Start all defined processes:

```bash
pocker start
```

This will start a Python HTTP server on 127.0.0.1:8080.

3. Check the status of your processes:

```bash
pocker status
```

4. View the logs:

```bash
pocker logs http-server
```

## License

Pocker is released under the [MIT License](./LICENSE).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any problems or have any questions, please open an issue on the GitHub repository.