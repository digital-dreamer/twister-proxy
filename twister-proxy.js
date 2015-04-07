var fs = require("fs");
var https = require("https");
var http = require("http");
var express = require("express");
var console = require("console");

var app = express();
var cors = require('cors');

try
{
    var settings = JSON.parse(fs.readFileSync("settings.json"));
}
catch(e)
{
    console.log("Error: Configuration file settings.json couldn't be parsed.\nSee Troubleshooting section in README.md for instructions.");
    process.exit(1);
}

if(settings.Server.enable_https)
{
    try
    {
        var privateKey  = fs.readFileSync(settings.Server.ssl_key_file).toString();
    }
    catch(e)
    {
        console.log("Error: unable to load SSL key. Please edit setting.json and put the correct path to your SSL private key file into \"ssl_key_file.\"");
        process.exit(1);
    }
    try
    {
        var certificate = fs.readFileSync(settings.Server.ssl_certificate_file).toString();
    }
    catch(e)
    {
        console.log("Error: unable to load SSL certificate. Please edit setting.json and put the correct path to your SSL certificate file into \"ssl_certificate_file.\"");
        process.exit(1);
    }
    var credentials = {key: privateKey, cert: certificate};
}

maxCallsPerMinute = {};
maxCallsPerMinutePerIP = {};
callsRemaining = {};
perIPCounter = {};
droppedCallsCounter = {};

var invalidRequestCounter = 0;
var forbiddenCallCounter = 0;
var connectionErrorMessageDisplayed = false;

var auth = "Basic " + new Buffer(settings.RPC.user + ":" + settings.RPC.password).toString("base64");

settings.CallLimits.forEach(function(x) {
    maxCallsPerMinute[x.name] = x.maxPerMinute;
    maxCallsPerMinutePerIP[x.name] = x.maxPerMinutePerIP;
    callsRemaining[x.name] = x.maxPerMinute;
    droppedCallsCounter[x.name] = 0;
});

CounterInstance = function()
{
    this.overLimit=0;
    this.invalidRequests=0;
    this.forbiddenCalls=0;
    this.callsRemaining={};
    for (x in maxCallsPerMinutePerIP)
    {
        if(maxCallsPerMinutePerIP[x]!==null)
        this.callsRemaining[x]=maxCallsPerMinutePerIP[x];
    }
}

require("log-timestamp");

app.use(cors());

app.get("*", function(request, response)
{
    if(settings.Server.enable_https&&request.protocol=="http")
    {
        if(settings.Server.https_port==443)
            secureUrl="https://"+request.host+request.path;
        else
            secureUrl="https://"+request.host+":"+settings.Server.https_port+request.path;
        response.writeHead(302, {"Location": secureUrl});
        response.end();
        return;
    }

    request.headers.Authorization = auth;
    
    var webProxy = http.request({host: settings.RPC.host, port: settings.RPC.port, method: request.method, path: request.path, headers: request.headers}, function (proxy_res)
    {
        proxy_res.pipe(response, {end: true});
    });
    
    webProxy.on("error", function(error)
    {
        if(!connectionErrorMessageDisplayed)
        {
            console.log("Error: cannot connect to twisterd.\nSee Troubleshooting section in README.md for instructions.");
            connectionErrorMessageDisplayed=true;
        }
        response.send(502);
    });
    
    request.pipe(webProxy, {end: true});
});

app.post("/", function(request, response)
{       
    request.rawBody = "";
    request.setEncoding("utf8");
    request.headers.Authorization = auth;

    request.addListener("data", function(chunk)
    {
        request.rawBody += chunk;
    });

    request.addListener("end", function()
    {
        var remoteIP = request.connection.remoteAddress;
        
        if(perIPCounter[remoteIP]===undefined)
        {    
            perIPCounter[remoteIP]=new CounterInstance();
        }
        try
        {
            bodyJson=JSON.parse(request.rawBody);
            rpcMethod=bodyJson.method;
        }
        catch(e)
        {
            perIPCounter[remoteIP].invalidRequests++;
            invalidRequestCounter++;
            return;
        }
        if(maxCallsPerMinute[rpcMethod]===undefined || maxCallsPerMinute[rpcMethod]===0)
        {
            perIPCounter[remoteIP].forbiddenCalls++;
            forbiddenCallCounter++;
            return;
        }
        if(maxCallsPerMinute[rpcMethod]!==null)
        {
            if(callsRemaining[rpcMethod]<1)
            {
                droppedCallsCounter[rpcMethod]++;
                return;
            }
            else
            {
                callsRemaining[rpcMethod]--;
            }
        }
    
        if(maxCallsPerMinutePerIP[rpcMethod]!==null)
        {    
            if(perIPCounter[remoteIP].callsRemaining[rpcMethod]<1)
            {
                perIPCounter[remoteIP].overLimit++;
                return;
            }
            else
            {
                perIPCounter[remoteIP].callsRemaining[rpcMethod]--;
            }
        }
    
        var rpcProxy = http.request({host: settings.RPC.host, port: settings.RPC.port, method: request.method, headers: request.headers}, function(proxy_res)
        {
            proxy_res.on("data", function(chunk)
            {
                response.write(chunk, "binary");
            });

            proxy_res.on("end", function(chunk)
            {
                response.end();
            });
        
            proxy_res.on("error", function(error)
            {
                if(!connectionErrorMessageDisplayed)
                {
                    console.log("Error: cannot connect to twisterd.\nSee Troubleshooting section in README.md for instructions.");
                    connectionErrorMessageDisplayed=true;
                }
                response.send(502);
            });

            response.writeHead(proxy_res.statusCode, proxy_res.headers);
        });
    
        rpcProxy.write(request.rawBody, "binary");
        rpcProxy.end();
    });
});

if(settings.Server.enable_https)
{
    https.createServer(credentials, app).listen(settings.Server.https_port);
}

http.createServer(app).listen(settings.Server.http_port);

setInterval(function()
{
    for(method in maxCallsPerMinute)
    {
        callsRemaining[method] = maxCallsPerMinute[method];
        if(droppedCallsCounter[method]!==0)
        {
            console.log("Dropped "+droppedCallsCounter[method]+" calls to "+method+" over the limit of "+maxCallsPerMinute[method]);
            droppedCallsCounter[method] = 0;
        }
    };
    if(invalidRequestCounter!==0)
    {
        console.log("Received "+invalidRequestCounter+" invalid POST requests.");
        invalidRequestCounter = 0;
    }
    if(forbiddenCallCounter!==0)
    {
        console.log("Denied "+forbiddenCallCounter+" attempts to access forbidden API calls.");
        forbiddenCallCounter = 0;
    }
    
    for(ip in perIPCounter)
    {
        if(perIPCounter[ip].overLimit>=settings.LogAsAttackThreshold.callsOverLimits)
        {
            console.log("IP "+ip+" tried to send "+perIPCounter[ip].overLimit+" calls more than the limits allow.");
        };
        if(perIPCounter[ip].invalidRequests>=settings.LogAsAttackThreshold.invalidRequests)
        {
            console.log("IP "+ip+" sent "+perIPCounter[ip].invalidRequests+" invalid request that couldn't be parsed.");
        };
        if(perIPCounter[ip].forbiddenCalls>=settings.LogAsAttackThreshold.forbiddenCalls)
        {
            console.log("IP "+ip+" tried to send "+perIPCounter[ip].forbiddenCalls+" calls to forbidden functions.");
        };
    }
    
    perIPCounter = {};
    connectionErrorMessageDisplayed = false;
    
}, 60000);
