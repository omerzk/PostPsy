"use strict";
var express = require('express');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require('fs');
var app = express();
var uuid = require('node-uuid');
var child = require("child_process");
var mkdir = require("mkdirp");
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

//constants
var numIter = '-num_iterations 1000';
var imageSz = '-image_size 400';
var backEnd = '-backend cudnn';
var output = "-output_image output.png";

var openReq = {};

app.post('/api/process/content', (req, res, nxt)=>{
  var id =  uuid.v1();
  var dirPath = "output/" + id + "/";
  mkdir(dirPath, null, ()=>{
    var contentPath = dirPath + "_content";
    fs.writeFileSync(contentPath, req.body);
  });
  res.statusCode(200).send("Style Still Needed");
});

app.post('/api/process/style', (req, res, nxt)=>{
  var id =  uuid.v1();
  var dirPath = "output/" + id + "/";
  var stylePath = dirPath + "_style";
  fs.writeFileSync(stylePath, req.body);
  //run the neural net torch implementation
  var spawn = child.spawn;
  var process = spawn('th',["~/", '../neural_style.lua', numIter, "-style_image " + stylePath,
    "-content_image" + contentPath, imageSz, backEnd, output]);

  //keep track of the output made/sent to the client.
  openReq[id] =  {next:1, maxAvailable: 0, pendingRes:res};
  res.body.id = id;
  res.statusCode(200).send();

  process.stdout.on('data', ()=>{
    openReq[id].maxAvailable++;
    outputFrame(id);
    })
});

app.post('/api/getframe', (req, res)=>{
  var id = req.body.id;
  if(id != null && openReq[id] != null){
    openReq[id].pendingRes = res;
    outputFrame(id);
  }
});

function outputFrame(id){
  var reqStatus = openReq[id];
  var dirPath = "output/" + id + "/";
  var next = (reqStatus.next * 100) % 1000;
  next = next ? "_" + next.toString() : "";
  if(reqStatus.maxAvailable >= reqStatus.next && reqStatus.pendingRes != null){
    reqStatus.pendingRes.sendFile(dirPath + "output" + next + ".png");
  }
}

module.exports = app;
