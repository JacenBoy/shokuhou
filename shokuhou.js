// The index.js file loads in command line arguments, then delegates the required tasks to the
// other scripts in the project

// First load the "net" module so we can set up a TCP connection
const net = require("net");

// Promises will make things a lot easier for us in the long run, so we'll use "promise-socket" to
// wrap our "net" socket in
const {PromiseSocket} = require("promise-socket");

// We'll also use "minimist" to load command line arguments into an object
const argv = require("minimist")(process.argv.slice(2), {
  string: ["u", "s", "r", "h", "p", "o"],
  boolean: ["help", "v"]
});

// We'll use an event listener to intercept uncaught exceptions and promise rejections and return
// them in a more readable format
require("./modules/errorHandler.js")();

// To make our code a bit cleaner, we'll load a custom function to extract SMTP status codes from
// the TCP responses we receive
const getStatus = require("./modules/getStatus.js");

//console.log(JSON.stringify(argv));

// First let's resolve all the command line arguments into variables for later use
// For laziness sake, we'll use a "try/catch" block along with "throw" statements to resolve required parameters

// Before anything else, we'll create an object to store all these parameters in
// This helps us avoid variable scope issues, plus it'll be more convenient when passing arguments
// to functions
const clientOpts = {};
try {
  // If the user specifically asked for help, drop everything and give it to them
  if (argv.help) throw "Help flag set";

  // First, check to make sure the required parameters are present
  // We need a user to send as, which will either be -u (user) or -s (sender)
  // If both are present, -s will take priority as the sender address and -u will just be used
  // for login
  // If only one is present, it should be -u
  if (!argv.u) throw "No user specified";
  clientOpts.user = argv.u;
  // Using the "or" operator (||) here saves us an "if" statement
  // If -s exists, that will be used; otherwise we'll use -u
  clientOpts.sender = argv.s || argv.u;
  clientOpts.domain = clientOpts.sender.split("@", 2)[1];

  // Now we'll check for -r (recipient), which is the address our script will send an email to
  if (!argv.r) throw "No recipient specified";
  clientOpts.recipient = argv.r;

  // Next, check for -h (host), which will be the hostname or IP of the server
  if (!argv.h) throw "No host specified";
  clientOpts.host = argv.h;

  // Finally, since we made it past our required arguments, also define any optional arguments if
  // they were provided
  if (argv.p) clientOpts.password = argv.p;
  clientOpts.port = argv.o || 25;
  if (argv.v) clientOpts.verbose = true;
} catch (ex) {
  // Hopefully the only way we reach this is if the user screwed up the command syntax
  // We'll output a help message to the user and let them try again
  console.log("Synatx: smtp-checker -h <server hostname/ip> -u <username> -r <recipient address>");
  console.log("Optional parameters:");
  console.log("--help: Displays this help message");
  console.log("-s: Sender address, if different that the username");
  console.log("-p: Password, if login is required");
  console.log("-o: The port that the server is listening on; defaults to 25");
  console.log("-v: Run in verbose mode");
  process.exit(0);
}

// Now we should have enough information to set up the connection to the server
// First, we need to set up our promisified socket
const socket = new net.Socket();
const client = new PromiseSocket(socket);
client.setTimeout(30 * 1000); // 30 seconds

// We need to use "await" to continue, which is only permitted inside "async" functions
// In order to get our code in an "async" function, we'll use an anonymous self-executing function
// These are really cool and I like to use them at every available opportunity
(async () => {
  // Now we can make our connection to the server
  // It's important that this and every other server interaction is wrapped in a "try/catch" since
  // the entire point of this program is to find the server errors for the user
  try {
    await client.connect({port: clientOpts.port, host: clientOpts.host});
    console.log(`[*] Connected to ${clientOpts.host}`);
  } catch (ex) {
    console.error(`An error occurred connecting to the server: ${ex.message}`);
    process.exit(0);
  }

  // Now grab the service banner from the server
  try {
    const banner = await client.read();
    if (clientOpts.verbose) console.debug(`[>] ${banner.toString().trim()}`);

    // The expected response code is 220
    if (getStatus(banner) != "220") throw new Error(`Improper response: ${banner.toString().trim()}`);
    console.log("[*] Received banner from the server");
  } catch (ex) {
    console.error(`[X] An error occurred reading the server banner: ${ex.message}`);
    client.destroy();
    process.exit(0);
  }

  // If the server gave us a sucessful response, send the greeting to start the session
  // We'll try EHLO first and fall back to HELO if the server doesn't support EHLO
  try {
    console.log("[*] Attempting to greet the server");

    if (clientOpts.verbose) console.debug(`[<] EHLO ${clientOpts.domain}`)
    await client.write(`EHLO ${clientOpts.domain}\r\n`);
    let helloResp = await client.read();
    if (clientOpts.verbose) console.debug(`[>] ${helloResp.toString().trim()}`);

    // A response of 502 means the server does not support EHLO
    if (getStatus(helloResp) == "502") {
      console.warn("[!] EHLO not supported, attempting HELO greeting");
      if (clientOpts.verbose) console.debug(`[<] HELO ${clientOpts.domain}`);
      await client.write(`HELO ${clientOpts.domain}\r\n`);
      helloResp = await client.read();
      if (clientOpts.verbose) console.debug(`[>] ${helloResp.toString().trim()}`);
    }

    // The expected response code is 250
    if (getStatus(helloResp) != "250") throw new Error(`Improper response: ${helloResp.toString().trim()}`);
    console.log("[*] Successfully greeted the server");
  } catch (ex) {
    console.error(`[X] An error occurred during the greeting: ${ex.message}`);
    client.destroy();
    process.exit(0);
  }

  // If the user supplied a password, attempt to use it to authenticate with the server
  if (clientOpts.password) {
    try {
      console.log("[*] Attempting authentication");
      if (clientOpts.verbose) console.debug("[<] AUTH LOGIN");
      await client.write("AUTH LOGIN\r\n");
      let loginResp = await client.read();
      if (clientOpts.verbose) console.debug(`[>] ${loginResp.toString().trim()}`);

      if (getStatus(loginResp) != "334") throw new Error(`Improper response: ${loginResp.toString().trim()}`);

      if (clientOpts.verbose) console.debug(`[<] ${btoa(clientOpts.user)}`);
      await client.write(`${btoa(clientOpts.user)}\r\n`);
      loginResp = await client.read();
      if (clientOpts.verbose) console.debug(`[>] ${loginResp.toString().trim()}`);

      if (getStatus(loginResp) != "334") throw new Error(`Improper response: ${loginResp.toString().trim()}`);

      if (clientOpts.verbose) console.debug(`[<] ${btoa(clientOpts.password)}`);
      await client.write(`${btoa(clientOpts.password)}\r\n`);
      loginResp = await client.read();
      if (clientOpts.verbose) console.debug(`[>] ${loginResp.toString().trim()}`);

      if (getStatus(loginResp) != "235") throw new Error(`Improper response: ${loginResp.toString().trim()}`);
      console.log("[*] Authentication successful");
    } catch (ex) {
      console.error(`[X] An error occurred during authentication: ${ex.message}`);
      client.destroy();
      process.exit(0);
    }
  }

  // Now we can attempt to send an email message
  // First we send the sender and recipient to the server to initiate the tansfer
  try {
    console.log("[*] Initiating mail transfer");
    if (clientOpts.verbose) console.debug(`[<] MAIL FROM: <${clientOpts.sender}>`);
    await client.write(`MAIL FROM: <${clientOpts.sender}>\r\n`);
    let userResp = await client.read();
    if (clientOpts.verbose) console.debug(`[>] ${userResp.toString().trim()}`);

    // The expected response code is 250
    if (getStatus(userResp) != "250") throw new Error(`Improper response: ${userResp.toString().trim()}`);

    if (clientOpts.verbose) console.debug(`[<] RCPT TO: <${clientOpts.recipient}>`);
    await client.write(`RCPT TO: <${clientOpts.recipient}>\r\n`);
    userResp = await client.read();
    if (clientOpts.verbose) console.debug(`[>] ${userResp.toString().trim()}`);

    // The expected response code is 250, however it can be 251 if the recipient is external
    if (getStatus(userResp) != "250" && getStatus(userResp) != "251") throw new Error(`Improper response: ${userResp.toString().trim()}`);

    console.log("[*] Mail transfer initiated");
  } catch (ex) {
    console.error(`[X] An error occurred during initiation: ${ex.message}`);
    client.destroy();
    process.exit(0);
  }

  // Now send the message data
  try {
    console.log("[*] Attempting to send message");
    if (clientOpts.verbose) console.debug(`[<] DATA`);
    await client.write("DATA\r\n");
    let dataResp = await client.read();
    if (clientOpts.verbose) console.debug(`[>] ${dataResp.toString().trim()}`);

    // The expected response code is 354
    if (getStatus(dataResp) != "354") throw new Error(`Improper response: ${dataResp.toString().trim()}`);

    // Note the double CRLF after the subject; this is required for the mail headers to parse
    if (clientOpts.verbose) console.debug(`[<] From: <${clientOpts.sender}> To: <${clientOpts.recipient}> Subject: SMTP Test Email If you have received this email, your SMTP server is configured correctly .`);
    await client.write(`From: <${clientOpts.sender}>\r\nTo: <${clientOpts.recipient}>\r\nSubject: SMTP Test Email\r\n\r\nIf you have received this email, your SMTP server is configured correctly\r\n.\r\n`);
    dataResp = await client.read();
    if (clientOpts.verbose) console.debug(`[>] ${dataResp.toString().trim()}`);

    // The expected response code is 250
    if (getStatus(dataResp) != "250") throw new Error(`Improper response: ${dataResp.toString().trim()}`);

    console.log("[*] Message accepted by the SMTP server");
  } catch (ex) {
    console.error(`[X] An error occurred sending the message: ${ex.message}`);
    client.destroy();
    process.exit(0);
  }

  // Send the QUIT command to the server and clean up the connection
  console.log("[*] Closing connection");
  if (clientOpts.verbose) console.debug(`[<] QUIT`);
  await client.write("QUIT\r\n");
  await client.end();
})();