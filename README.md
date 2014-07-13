twister-proxy
=============

Version 0.1.1

This is an RPC proxy for running a public server for the Twister P2P microblogging network. Public servers allow anyone to easily read news posted on Twister from the web. If a user wants to become active on the network, he/she is directed to instructions on how to install the app. Twister proxy needs twister-core to be able to access the network.

Twister is in alpha phase, it's still under construction. It is already being used, but it may be unstable, and difficult to compile. This is the project website http://twister.net.co/

Twister is open source, the source code is available here: https://github.com/miguelfreitas/twister-core

## Running a public server

**1 - install Twister**

instructions can be found here: http://twister.net.co/?page_id=23

**2 - install node.js**

it's available for all major platforms from here: http://nodejs.org/

**3 - install twister-proxy**

clone it from the repository

> git clone https://github.com/digital-dreamer/twister-proxy.git
  
install it

> cd twister-proxy

> npm install

**4 - run twisterd**

go to your twister-core folder and run twisterd with the following options:

> ./twisterd -daemon -rpcallowip=127.0.0.1 -public_server_mode=1
  
This will run twister server in background, allow RPC calls, but only from the same computer, and put it in "public server mode", which is designed for this purpose.

**5 - run twister-proxy**

go to the twister-proxy folder and run

> node twister-proxy.js &

this will launch a public server on default http port 80. If you need to change any settings, you can edit the settings.json file.
  
If you type your server's URL into a web browser, you should see the twister web application. It is now functional, but if you care about privacy for your users, I highly recommend taking one more step and enabling SSL.

## Enable SSL

**1 - upgrade OpenSSL to the latest version to protect your server from Heartbleed**

Visit http://heartbleed.com/ if you want to know more about this issue.
  
**2 - generate a key and certificate request**

> openssl genrsa -des3 -out server-key.pem 2048

> openssl req -new -key server-key.pem -out request.csr
  
Keep the generated server-key.pem safe.
  
If you want to know more about keys: https://www.openssl.org/docs/HOWTO/keys.txt

**3 - request a certificate**
   
You now give the request.csr file to a Certification Authority (CA) - a company that will generate a certificate and give it back to you.
  
This guide shows where to get a certificate cheap or for free:
    
http://webdesign.about.com/od/ssl/tp/cheapest-ssl-certificates.htm
    
**4 - enable SSL in twister-proxy**

Edit the settings.json file
    
* In "ssl_key_file", specify a path to the server-key.pem file that you generated.
* In "ssl_certificate_file", specify a path to the file that you received from your Certificate Authority.
* Change "enable_https" from false to true.
    
That's it. If you now run twister-proxy, it will use secure https connections.

## Production

**1 - To keep a log, redirect twister proxy output to a file**

Example:
> node twister-proxy.js > output.log &


**2 - You can use the "forever" module to keep the proxy server running** 

A guide can be found here:

https://blog.nodejitsu.com/keep-a-nodejs-server-up-with-forever/

## Troubleshooting

### Cannot connect to twisterd

Twister must be running and accepting RPC calls, run it with these parameters:
    
> ./twisterd -daemon -rpcallowip=127.0.0.1 -public_server_mode=1
    
If you changed the RPC port, username or password in twister.conf, you need to change it in settings.json too.
    
### Configuration file settings.json couldn't be parsed

You probably damaged settings.json when editing it. If you can spot what went wrong, you can correct it, if not, download the default settings.json and redo your customization.


If you get stuck, and need some help setting up a public Twister server, you can ask in the issue section, even if it is not an actual issue with the code.
