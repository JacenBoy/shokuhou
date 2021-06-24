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
  boolean: ["help"]
});

// We'll use an event listener to intercept uncaught exceptions and promise rejections and return
// them in a more readable format
require("./modules/errorHandler.js")();

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
} catch (ex) {
  // Hopefully the only way we reach this is if the user screwed up the command syntax
  // We'll output a help message to the user and let them try again
  console.log("Synatx: smtp-checker -h <server hostname/ip> -u <username> -r <recipient address>");
  console.log("Optional parameters:");
  console.log("--help: Displays this help message");
  console.log("-s: Sender address, if different that the username");
  console.log("-p: Password, if login is required");
  console.log("-o: The port that the server is listening on; defaults to 25");
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
    console.error(`An error occurred connecting to the server: ${ex}`);
    process.exit(0);
  }

  // Now grab the service banner from the server
  try {
    const banner = await client.read();
    // The expected response code is 220
    if (banner.toString().substring(0,3) != "220") throw `Improper response: ${banner.toString()}`;
    console.log("[*] Received banner from the server");
  } catch (ex) {
    console.error(`[X] An error occurred reading the server banner: ${ex}`);
    client.destroy();
    process.exit(0);
  }

  // If the server gave us a sucessful response, send the greeting to start the session
  // We'll try EHLO first and fall back to HELO if the server doesn't support EHLO
  try {
    await client.write(`EHLO ${clientOpts.domain}\r\n`);
    let helloResp = await client.read();
    // A response of 502 means the server does not support EHLO
    if (helloResp.toString().substring(0,3) == "502") {
      console.warn("[!] EHLO not supported, attempting HELO greeting");
      await client.write(`HELO ${clientOpts.domain}\r\n`);
      helloResp = await client.read();
    }
    // The expected response code is 250
    if (helloResp.toString().substring(0,3) != "250") throw `Improper response: ${helloResp.toString()}`;
    console.log("[*] Successfully greeted the server");
  } catch (ex) {
    console.error(`[X] An error occurred during the greeting: ${ex}`);
    client.destroy();
    process.exit(0);
  }

  // If the user supplied a password, attempt to use it to authenticate with the server
  // TODO: Implement authentication

  // Now we can attempt to send an email message
  // First we send the sender and recipient to the server to initiate the tansfer
  try {
    await client.write(`MAIL FROM: <${clientOpts.sender}>\r\n`);
    let userResp = await client.read();
    // The expected response code is 250
    if (userResp.toString().substring(0,3) != "250") throw `Improper response: ${userResp.toString()}`;
    await client.write(`RCPT TO: <${clientOpts.recipient}>\r\n`);
    userResp = await client.read();
    // The expected response code is 250, however it can be 251 if the recipient is external
    if (userResp.toString().substring(0,3) != "250" && userResp.toString().substring(0,3) != "251") throw `Improper response: ${userResp.toString()}`;
    console.log("[*] Mail transfer initiated");
  } catch (ex) {
    console.error(`[X] An error occurred during initiation: ${ex}`);
    client.destroy();
    process.exit(0);
  }

  // Now send the message data
  try {
    await client.write("DATA\r\n");
    let dataResp = await client.read();
    // The expected response code is 354
    if (dataResp.toString().substring(0,3) != "354") throw `Improper response: ${dataResp.toString()}`;
    // Note the double CRLF after the subject; this is required for the mail headers to parse
    await client.write(`From: <${clientOpts.sender}>\r\nTo: <${clientOpts.recipient}>\r\nSubject: SMTP Test Email\r\n\r\nIf you have received this email, your SMTP server is configured correctly\r\n.\r\n`);
    dataResp = await client.read();
    // The expected response code is 250
    if (dataResp.toString().substring(0,3) != "250") throw `Improper response: ${dataResp.toString()}`;
    console.log("[*] Message accepted by the SMTP server");
  } catch (ex) {
    console.error(`[X] An error occurred sending the message: ${ex}`);
    client.destroy();
    process.exit(0);
  }

  // Send the QUIT command to the server and clean up the connection
  console.log("[*] Closing connection");
  await client.write("QUIT\r\n");
  await client.end();
})();