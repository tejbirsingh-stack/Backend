const fs = require('fs');
const path = require('path');
function getAllFiles(dirPath, arrayOfFiles = []){
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);                                        
  files.forEach(function(file){
    if(fs.statSync(dirPath + "/" + file).isDirectory()){
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}
const uploadsDir = path.join(__dirname, 'apps/api/uploads');
const files = getAllFiles(uploadsDir);
console.log(files);
