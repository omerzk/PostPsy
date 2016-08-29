"use strict";
var express = require('express');
var favicon = require('serve-favicon');
var logger = require('morgan');
var bodyParser = require('body-parser');
var app = express();
var uuid = require('node-uuid');
var child = require("child_process");
var exec = require("child_process").exec;
var mkdir = require("mkdirp");
var multer  =   require('multer');
var fs = require('fs');
var mime = require('node-mime');
var path = require('path');

//change current working directory to satisfy torch dependencies;
//pr.stdout.on('data', (data)=>{
//  console.log(data);
//});
//pr.stderr.on('data', (data)=>{
//  console.log(data);
//});

//configure multer file upload
var storage =   multer.diskStorage({
  destination: function (req, file, callback) {
    console.log("dest!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    mkdir(req.dirPath, null, ()=>{
      callback(null, req.dirPath);
    });
  },
  filename: function (req, file, callback) {
    console.log("filename!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    req[file.fieldname] =  file.fieldname + "." + mime.lookUpExt(file.mimetype);
    console.log(file.fieldname);
    callback(null, file.fieldname + "." + mime.lookUpExt(file.mimetype));
  }
});

var uploadFull = multer({storage : storage}).fields([{name:"content" , maxCount:1}, {name:"style" , maxCount:1}]);
var uploadPartial = multer({storage : storage}).single("content");

app.use(logger('dev'));
app.use(bodyParser.json({limit: '50mb'}));

//constants
var torchImpPath = '/home/ubuntu/cudnn-6.5-linux-x64-v2-rc2/neural-style/';
var chainerPath = '/home/ubuntu/venv/chainer-fast-neuralstyle/';
var BaseModelPath = '/home/ubuntu/venv/chainer-fast-neuralstyle-models/models/';
var chainerModels = ['cubist.model', 'edtaonisl.model', 'hokusai.model',
  'hundertwasser.model', 'kandinsky.model', 'starrynight.model'];//add path in remote instance

var imageSz = '400';
var backEnd = 'cudnn';
var numIterations = '1000';

var torchArgs = ['th', 'neural_style.lua',
  '-num_iterations' , numIterations,
  '-style_image', null,
  '-content_image', null,
  '-image_size', imageSz,
  '-backend', backEnd,
  '-output_image', null,
  '-print_iter', '100'];


app.post('/api/process', (req, res)=>{
  var id =  uuid.v1();
  var dirPath = path.join(__dirname, "output/" + id + "/");
  var outputPath = dirPath + "output.png";
  req.dirPath = dirPath;

  uploadFull(req,res,function(err) {
    if(err) {
      return res.end("Error uploading files." + err);
    }
    var args = torchArgs;
    args[5] = dirPath + req.content;
    args[7]= dirPath + req.style;//TODO change both to vars.
    console.log("post, torch: " + id);
    //run the neural net torch implementation
    exec(torchArgs.join(' '),{cwd:torchImpPath} , () => outputFrame(res, outputPath));
  }
  );
});

app.post('/api/presets', (req, res)=> {
  var id = uuid.v1();
  var dirPath = path.join(__dirname, "output/" + id + "/");
  req.dirPath = dirPath;
  var outputPath = dirPath + "output.png";
  uploadPartial(req, res, function (err) {
    if (err) {
      return res.end("Error uploading files." + err);
    }
    var contentPath = dirPath + req.content;
    console.log("Model:------------------  ",req);
    var modelPath = BaseModelPath + chainerModels[parseInt(req.body.model)];
    //exec('python',[chainerPath + 'generate.py', contentPath, '-m ' + modelPath, '-o ' + outputPath].join(' '),
    //    {cwd:'/home/ubuntu/venv/bin'}, () => outputFrame(res, outputPath));

    let args = [chainerPath + 'generate.py', contentPath, '-m', modelPath, '-o', outputPath];
    var process = child.spawn('/home/ubuntu/venv/bin/python', args);

    process.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    process.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`);
    });

    process.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    });
  });
});

function outputFrame(res, path){
    res.sendFile(path, {}, (err)=>{
      if(err){
        logErr('SendFile', err);
      }
      //remove file that was already sent
      fs.unlink(path, (err) => logErr('unlink', err));
    });
}


function logErr(funcName, err) {
  if(err)
    console.log(funcName + " error: " + err);
}

module.exports = app;
