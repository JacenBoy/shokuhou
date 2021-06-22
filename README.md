# Shokuhou
 A simple SMTP server tester in Node.js

## Why does this exist?
Testing a newly set up SMTP server is easy to do using Telnet, but remembering the syntax for SMTP commands sucks. I couldn't find anything that did what I wanted to do, so I made this as a way to automate the basic SMTP test so I wouldn't have to remember things anymore.

## What does it do?
Shokuhou will autmoatically go through the process of running the basic commands required to send a test email, reporting each step of the way and letting you know exactly where it failed.

## Usage
Shokuhou is a command-line application with three required parameters.

```
shokuhou -h <server hostname/ip> -u <username> -r <recipient address>
```

The below flags are optional parameters.

```
--help: Displays the help message
-s: Sender address (if different that the username)
-p: The server login password (if authentication is required)
-o: The port to connect to on the server (defaults to 25)
```

## Building
Shokuhou is a Node.js application and is built using pkg. Any reasonably recent version of Node should suffice, but it's recommended to use the latest LTS release. Make sure pkg is installed globally in order to build the application.

```
npm install -g pkg
```

Then you can clone the repository, install the dependencies using npm, and use pkg to build the application.

```
npm install
pkg run build
```

## Who's the anime girl mascot?
[Misaki Shokuhou](https://toarumajutsunoindex.fandom.com/wiki/Shokuhou_Misaki), from [A Certain Scientific Railgun](https://kitsu.io/anime/toaru-kagaku-no-railgun).