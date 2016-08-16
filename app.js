"use strict";
var express = require('express');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var app = express();
var uuid = require('node-uuid');
var child = require("child_process");
var mkdir = require("mkdirp");
var multer  =   require('multer');
var fs = require('fs');
var rimraf = require('rimraf');
var mime = require('node-mime');
var path = require('path');
// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
//change current working directory to satisfy torch dependencies;
require('process').chdir('/home/ubuntu/cudnn-6.5-linux-x64-v2-rc2/neural-style');
//configure multer file upload
var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
    mkdir(req.dirPath, null, ()=>{
      callback(null, req.dirPath);
    });
  },
  filename: function (req, file, callback) {
    req[file.fieldname] =  file.fieldname + "." + mime.lookUpExt(file.mimetype);
    console.log(file.fieldname);
    callback(null, file.fieldname + "." + mime.lookUpExt(file.mimetype));
  }
});

var upload = multer({ storage : storage }).any();//TODO: limit fields to content and style VULNERABLE

app.use(logger('dev'));
app.use(bodyParser.json({limit: '50mb'}));
//app.use(cookieParser());

//constants
//var numIter = '-num_iterations 1000';//it's the default
var imageSz = '400';
var backEnd = 'cudnn';
var numIterations = '1000';
var openReq = {};


app.post('/api/process', (req, res, nxt)=>{
  var id =  uuid.v1();
  var dirPath = path.join(__dirname, "output/" + id + "/");
  var output = dirPath + "output.png";
  //keep track of the output made/sent to the client.
  openReq[id] =  {next:1, maxAvailable: 0, pendingRes:null};
  req.dirPath = dirPath;

  upload(req,res,function(err) {
    if(err) {
      return res.end("Error uploading files." + err);
    }
    var contentPath = dirPath + req.content;
    var stylePath = dirPath + req.style;
    console.log("post, id: " + id);
    //run the neural net torch implementation
    var spawn = child.spawn;
    var process = spawn('th',['neural_style.lua',
      '-num_iterations' , numIterations,
      '-style_image', stylePath,
      '-content_image', contentPath,
      '-image_size', imageSz,
      '-backend', backEnd,
      '-output_image', output]);

    //ack and send identifier
    res.status(200).send();
    process.stderr.on('data',(data)=>console.log("error------------------------" + data.toString()));
    process.stdout.on('data', (data)=>{
      console.log("data--------------------------- " + data.toString());
      openReq[id].maxAvailable++;
      outputFrame(id);
    })

  })
});

app.post('/api/getframe', (req, res)=>{
  var id = req.body.id;
  if(id != null && openReq[id] != null){
    //store the res, respond when we have results.
    openReq[id].pendingRes = res;
    outputFrame(id);
  }
});

function logErr(funcName, err) {
  if(err)
    console.log(funcName + " error: " + err);
}
function outputFrame(id){
  var reqStatus = openReq[id];
  var dirPath = "output/" + id + "/";

  var next = (reqStatus.next * 100) % 1000;
  next = next ? "_" + next.toString() : "";

  console.log('maxAvailable - ' + reqStatus.maxAvailable.toString() + " next" + next.toString());
  if(reqStatus.maxAvailable >= reqStatus.next && reqStatus.pendingRes != null){
    var p = path.join(__dirname, dirPath + "output" + next + ".png" );
    reqStatus.pendingRes.sendFile(p, {}, (err)=>{
      if(err){
        return logErr('SendFile', err);
      }

      reqStatus.next++;
      //remove file that was already sent
      if(next > 0){
        fs.unlink(p, (err) => logErr('unlink', err));
      }
      else{
        //end of operation remove entire folder and source files
        rimraf(dirPath, (err) => logErr('unlink', err));
      }
    });
  }
}

module.exports = app;
