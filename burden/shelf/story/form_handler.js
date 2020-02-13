const fs = require('fs');
const fsp = fs.promises;
const fsx = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const iconv = require('iconv-lite');
const EncodingJP = require('encoding-japanese');
const xlsx = require('xlsx');
const papa = require('papaparse');

const Story = disc('class/Story');

module.exports = class extends Story {

  constructor(core){
    super(core);
    this.compose([
      "main"
    ]);

    this.keep_limit = 40;

    this.path = {};
    this.path.storage = this.core.config.path.app + path.sep + 'storage';
  }

  /*
   */
  async chapter_main(param){

    if(!param.mode){
      this.abort("invalid mode");
    }

    if(!param.token){
      this.abort("invalid request");
    }

    if(typeof param.debug == 'undefined'){
      param.debug = true;
    }

    param.token = param.token.replace(path.sep, "-");

    this.path.working = this.path.storage + path.sep + param.token;
    this.path.content = this.path.working + path.sep + 'content';
    this.path.content_mutual = this.path.working + path.sep + 'content_mutual';
    this.path.result = this.path.working + path.sep + "result";
    this.path.uploaded_destlist_basename = this.path.working + path.sep + "uploaded_destlist";
    this.path.generated_destlist_file = this.path.working + path.sep + "destlist.csv";
    this.path.queue = this.path.working + path.sep + 'queue';
    this.path.history = this.path.working + path.sep + 'history';
    await this.rotate_directory(this.path.storage, this.keep_limit);
    await this.rotate_directory(this.scene.argument.server.config.path.expose.bucket, this.keep_limit);

    let mode = param.mode;
    try{
      let action = "action_" + mode;
      let result = await this[action](param);
      return result;
    }catch(e){
      console.error(e);
      throw e;
    }
  }

  async action_generate_result_csv(param){
    if(!param.timestamp){
      throw new Error("invalid request");
    }

    var dr = this.path.history + path.sep + param.timestamp;
    var drs = await fsp.readdir(dr);
    var result_string = "";

    var matr = [];
    matr.push([
      'id', 'label', 'email',
      'attachment', 'attachment_mutual',
      'status', 'response', 'error'
    ]);
    for(var ent of drs){
      var row = [];
      var buf = await fsp.readFile(dr + path.sep + ent);
      var json = JSON.parse(buf.toString());
      row.push(json.entry.id || json.request.target_id || "");
      row.push(json.entry.label || json.request.target_label || "");
      row.push(json.entry.email || json.request.target_email || "");
      row.push(
        (json.entry.attachment || []).map((a) => {
          return a.entity + a.type;
        }).join(" & ")
      );
      row.push(
        (json.entry.attachment_mutual || []).map((a) => {
          return a.entity + a.type;
        }).join(" & ")
      );
      row.push(json.status);
      row.push(json.response);
      row.push(json.error);
      matr.push(row);
    }

    result_string = await papa.unparse(matr);

    return {
      csv: result_string
    };
  }

  async action_send_mail_prepare(param){
    if(!param.server_host){
      throw new Error("server_host is required.");
    }

    if(!param.sender_email){
      throw new Error("sender_email is required.");
    }

    if(!param.mail_subject){
      throw new Error("mail_subject is required.");
    }

    if(!param.mail_body){
      throw new Error("mail_body is required.");
    }

    var res = await this.action_fetch_info(param);
    var timestamp = (new Date()).getTime();
    var chn = timestamp + '.json';
    await fsx.mkdirp(this.path.queue);
    await fsx.mkdirp(this.path.history + path.sep + timestamp);
    await this.rotate_directory(this.path.queue);
    await this.rotate_directory(this.path.history);
    await fsp.writeFile(this.path.queue + path.sep + chn, JSON.stringify(res));

    res.timestamp = timestamp;

    return res;
  }

  async action_send_mail(param){
    console.log("send mail --------------------------------");
    console.log("request =", param);

    if(!param.timestamp){
      throw new Error("Invalid Request");
    }

    if(!param.server_host){
      throw new Error("server_host is required.");
    }

    if(!param.sender_email){
      throw new Error("sender_email is required.");
    }

    if(!param.target_email){
      throw new Error("target_email can not be empty.");
    }

    var queue;
    try{
      queue = await fsp.readFile(this.path.queue + path.sep + param.timestamp + '.json');
      queue = JSON.parse(queue);
    }catch(e){
      throw new Error("queue not found.");
    }

    var mailer = this.core.mail.engine;
    var trns = mailer.createTransport({
      host: param.server_host,
      port: param.server_port || 587
    });

    var result = {
      status: false,
      entry: {},
      request: param,
      response: "",
      error: null
    };

    /* main proc */
    var matched = false;
    var entry;
    var template_variable = {
      target: {}
    };
    try{

      for(var q of queue.list){
        if(
          q.email && (q.email == param.target_email)
        ){
          matched = q;
          break;
        }
      }

      if(!matched){
        throw new Error("no entry found.");
      }

      if(param.config_require_personal_attachment){
        if(matched.attachment.length == 0){
          throw new Error("no attachment with config_require_personal_attachment");
        }
      }

      entry = new DestinationEntry(matched);
      result.entry = entry;

      template_variable.target = matched;

      console.log("param =", param);
      console.log("entry =", entry);

      var destination_email_address = false;
      if(param.debug){
        destination_email_address = param.debug_taget_email || false;

        if(param.mail_subject){
          param.mail_subject = ''
            + '[DEBUG MODE] '
            + param.mail_subject
        }

        if(param.mail_body){
          param.mail_body = ''
            + "==== THIS IS THE DEBUG MODE MESSAGE ====\n"
            + "Note: Actual message will be sent to `" + entry.email + "`\n"
            + "\n"
            + param.mail_body
        }
      }else{
        //
        destination_email_address = entry.email;
      }

      if(!destination_email_address){
        throw new Error("Invalid destination email address.");
      }

      var cnt = {
        from: (param.sender_display_name)
        ? ('"' + param.sender_display_name + '" <' + param.sender_email + '>')
        : (param.sender_email),
        to: destination_email_address,
        attachments: [
          //{ filename: 'text3.txt', path: '/path/to/file.txt' }
        ]
      };
      // Mail Subject
      var sbj = await this.core.template.compile(param.mail_subject, template_variable);
      cnt.subject = entry.format(sbj);
      // Mail Body
      var bdy = await this.core.template.compile(param.mail_body, template_variable);
      bdy = entry.format(bdy);
      if(param.mail_body_type == "html"){
        cnt.html = bdy;
      }else{
        cnt.text = bdy;
      }
      // Attachment
      var atts = [];
      for(var a of entry.attachment){
        atts.push({
          filename: a.entity + a.type,
          path: a.path
        });
      }
      for(var a of entry.attachment_mutual){
        atts.push({
          filename: a.entity + a.type,
          path: a.path
        });
      }
      cnt.attachments = atts;
      // Proc.
      var info = await trns.sendMail(cnt);
      result.response = info.response.split("\n").join(";");
      if(result.response.match(" OK ")){
        result.status = true;
      }
    }catch(e){
      result.error = e.message;
    }

    // log
    if(param.timestamp && param.target_label){
      await fsp.writeFile(
        this.path.history
          + path.sep + param.timestamp
          + path.sep
          + (param.target_label.replace(/(　| )/g, "").replace(path.sep, "_") + ".json"),
        JSON.stringify(result)
      );
    }

    await FM.async.sleep(100);

    return result;
  }

  async action_fetch_info(param){
    if(!param.query_format){
      throw new Error("query_format is required.");
    }
    if(!param.query_type){
      throw new Error("query_type is required.");
    }

    let stream;
    let sending = [];

    stream = await fsp.readFile(this.path.generated_destlist_file);
    let data_destlist = await this.retrieve_csv_content(stream.toString(), {
      as_object: true
    });

    var drs;

    //
    let data_attachment = await this.collect_dir_info(this.path.content);
    let data_attachment_mutual = await this.collect_dir_info(this.path.content_mutual);

    // check
    var hd = data_destlist.__header;
    var hdsel = hd.slice(0, 3);
    if(hdsel.length < 3){
      throw new Error("Invalid destlist data at " + JSON.stringify(dst));
    }

    sending = await this.collect_match(param, data_destlist, data_attachment, data_attachment_mutual);
    var result = {
      header: hd,
      list: sending
    };
    return result;
  }

  async collect_dir_info(src, hier){
    let ret = [];
    let drs = await fsp.readdir(src);
    for(let v of drs){
      let fb = path.basename(v);

      let entpath = src + path.sep + v;
      let ex = path.extname(v);
      let st = await fsp.stat(entpath);
      let pf = (hier ? (hier.join("-") + "_") : "");
      let is_dir = st.isDirectory();

      fb = fb.replace(new RegExp("\\" + ex + "$"), "");

      let bs = {
        entity: fb,
        type: (is_dir) ? "dir" : ex,
        path: src + path.sep + v,
        hier: (hier || []).slice(),
        content: []
      };
      if(fb){
        if(is_dir){
          var h = (hier || []).concat(v)
          let sub = await this.collect_dir_info(entpath, h);
          bs.content = bs.content.concat(sub);
          for(var s of sub){
            if(s.content.length){
              // Merge all sub-contents to BASE entry.
              // bs.content = bs.content.concat(s.content);
            }
          }
        }else{
          // this is it.
        }
        ret.push(bs);
      }
    }

    return ret;
  }

  async collect_match(param, data_destlist, data_attachment, data_attachment_mutual){
    let sending = [];
    switch(param.query_type){
      /*==========
       */
      case "attachment":
        for(var att of data_attachment){
          // Finding matched DESTINATION with query.
          var found = false;
          var row = null;
          for(var dst of data_destlist){
            var dm = new DestinationEntry();
            dm.bind(dst, data_destlist.__header);
            var q = dm.format(param.query_format);
            q = q.replace(/(　| )/g, "");
            if(att.entity == q){
              var mt = new DestinationEntry();
              mt.bind(dst, data_destlist.__header);
              mt.append_attachment(att);
              row = null;
              row = mt;
              break;
            }
          }
          if(!row){
            row = new DestinationEntry();
            row.label = att.entity;
          }
          row.append_attachment_mutual(data_attachment_mutual);
          sending.push(row);
        }
        break;

      /*==========
       */
      case "destlist":
        for(var dst of data_destlist){
          let row = new DestinationEntry();
          row.bind(dst, data_destlist.__header);
          // query attachment
          var q = row.format(param.query_format);
          q = q.replace(/(　| )/g, "");
          for(var att of data_attachment){
            if(att.entity == q){
              row.append_attachment(att);
              break;
            }
          }
          row.append_attachment_mutual(data_attachment_mutual);
          sending.push(row);
        }
        break;
      default:
        throw new Error("Invalid query type: " + param.query_type);
    }

    return sending;
  }

  async action_send(param){
  }

  async action_register_attachment(param){
    // Cleaning
    try{
      await fsx.remove(this.path.content);
      await fsx.remove(this.path.content_mutual);
    }catch(e){
      //
    }
    await fsx.mkdirp(this.path.content);
    await fsx.mkdirp(this.path.content_mutual);

    // Error Check
    if(!param.file.destlist){
      throw new Error("destlist can not be empty.");
    }
    if(param.file.attachment){
      if([
        "application/zip",
        "application/octet-stream",
        "application/x-zip-compressed",
        "multipart/x-zip"
      ].indexOf(param.file.attachment.type) < 0){
        throw new Error("Not Supported Attachment => "
          + param.file.attachment.type);
      }
    }
    if(param.file.attachment_mutual){
      if([
        "application/zip",
        "application/octet-stream",
        "application/x-zip-compressed",
        "multipart/x-zip"
      ].indexOf(param.file.attachment_mutual.type) < 0){
        throw new Error("Not Supported Mutual Attachment => "
          + param.file.attachment_mutual.type);
      }
    }

    let ft = this.detect_list_filetype(param.file.destlist);
    if([ "csv", "xlsx" ].indexOf(ft) < 0){
      throw new Error("Invalid file type: "
        + param.file.destlist.name
        + ft + "[" + param.file.destlist.type + "]"
      );
    }

    // Ready
    let dst = await this.retrieve_dest_info(param.file.destlist);

    let att = [];
    if(param.file.attachment){
      att = await this.unpack(param.file.attachment, this.path.content);
    }

    let att_mut = [];
    if(param.file.attachment_mutual){
      att_mut = await this.unpack(param.file.attachment_mutual, this.path.content_mutual);
    }

    return {
      token: param.token,
      dest: dst,
      attachment: att,
      attachment_mutual: att_mut
    };
  }

  async retrieve_dest_info(file){
    let ft = this.detect_list_filetype(file);
    let data;

    let destpath = this.path.uploaded_destlist_basename + path.extname(file.path);
    try{
      await fsp.unlink(destpath);
    }catch(e){
      // ignore
    }
    await fsp.copyFile(file.path, destpath);
    if(ft == "csv"){
      let bf = await fsp.readFile(destpath);
      let en = EncodingJP.detect(bf);
      let cn = iconv.decode(bf, en);
      data = await this.retrieve_csv_content(cn.toString(), {
        as_object: true
      });
    }else if(ft == "xlsx"){
      data = await this.retrieve_excel_content(destpath, {
        as_object: true
      });
      let sheet_names = Object.keys(data);
      // picks `first` sheet content.
      for(var k of sheet_names){
        data = data[k];
        break;
      }
    }
    let str = await papa.unparse(data);
    await fsp.writeFile(this.path.generated_destlist_file, str);
    return data;
  }

  detect_list_filetype(file){
    switch(file.type){
      case "text/csv":
        return "csv";
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return "xlsx";
      default:
        return false;
    }
  }

  async retrieve_excel_content(path, config){
    var cnf = config || {xlsx: {}};
    var book = await this.read_xlsx(path, cnf.xlsx || {});
    var tgt_sh = cnf.sheet || ["data"];
    var data = {};
    let shnm_list = book.SheetNames;
    for(var shnm of shnm_list){
      var sheet = book.Sheets[shnm];
      var csv = xlsx.utils.sheet_to_csv(sheet);
      data[shnm] = await this.retrieve_csv_content(csv, cnf);
    }
    book = null;
    return data;
  }

  /* ( csv:string
   *   config:object
   * ) -> array|object
   */
  async retrieve_csv_content(csv, config){
    var i = 0;
    var header = null;

    var cnf = FM.ob.define({
      header: 1, // 1-origin
      as_object: false,
      has_pk: false,
      pk_col: false, // 1-origin
    })(config || {});

    var ret = cnf.has_pk ? {} : [];
    var proc = new Promise(function(res, rej){
      papa.parse(csv, {
        header: false,
        step: function(row_handler){
          i++;
          var pk;
          var row = row_handler.data.map(a => a.trim());
          var chk = row.filter(a => a);
          if(!chk.length){
            return;
          }
          if(cnf.header){
            if(i == cnf.header){
              header = row.slice();
              Object.defineProperty(ret, '__header', {
                value: header,
                enumerable: false
              });
              return;
            }else{
              // Skips rows until header is filled.
              if(!header){
                return;
              }
            }
          }
          if(cnf.has_pk && cnf.pk_col){
            pk = row[cnf.pk_col - 1];
            if(!pk){
              // retrieve_csv_content: pk is empty but has_pk is true
              return;
            }
          }
          var inserting;
          if(cnf.as_object){
            var data = {};
            if(!header.length){
              throw new Error("retrieve_csv_content header should be set when as_object is on");
            }
            header.map(function(k, i){
              data[k] = row[i];
            });
            inserting = data;
          }else{
            inserting = row;
          }

          if(pk){
            ret[pk] = inserting;
          }else{
            ret.push(inserting);
          }
        },
        error: function(e){
          rej(e);
        },
        complete: () => {
          res(ret);
        }
      });
    });

    return await proc;
  }

  async read_xlsx(path, config){
    var cnf = config || {};
    var book = await xlsx.readFile(path, cnf);
    return book;
  }


  /*
   */
  async pack(type, opt, dest_archive_path, entry_list, callback){
    // create a file to stream archive data to.
    return new Promise((res, rej) => {
      let output = fs.createWriteStream(dest_archive_path);
      let archive = archiver(type, opt);

      // listen for all archive data to be written
      // 'close' event is fired only when a file descriptor is involved
      output.on('finish', function(){
        res(true);
      });
      output.on('end', function(){
        res(true);
      });

      // good practice to catch warnings (ie stat failures and other non-blocking errors)
      archive.on('warning', function(err) {
        console.error(err);
        if(err.code === 'ENOENT'){
        }else{
          // throw error
          throw err;
        }
      });

      archive.on('error', function(err) {
        console.error(err);
        throw err;
      });

      // append a file from stream
      if(typeof entry_list == "string"){
        archive.directory(entry_list, false);
      }else{
        for(let f of entry_list){
          let ex = path.extname(f[0]);
          let op = { name: f[1] + ex };
          let st;
          try{
            st = fs.createReadStream(f[0]);
          }catch(e){
            console.error(e);
          }
          archive.append(st, op);
        }
      }

      archive.pipe(output);

      // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
      archive.finalize();
    });
  }

  /*
   */
  async unpack(file, dest_dir){
    let files = [];
    let zip_file_path = file.path;
    let trail = (new RegExp("(\\\\|/)$"));
    let zip_fnsp = file.name.split(".");
    let zip_fext = zip_fnsp.pop();
    let zip_fbsn = zip_fnsp.join(".");
    let zip_fbsn_reg = new RegExp("^" + zip_fbsn);
    return new Promise((res, rej) => {
      fs.createReadStream(zip_file_path)
        .pipe(unzipper.Parse())
        .on('entry', async (entry) => {
          try{
            let enc = EncodingJP.detect(entry.props.pathBuffer);
            let f = iconv.decode(entry.props.pathBuffer, enc);
            if(trail.test(f)){
              await fsp.mkdir(dest_dir + path.sep + f);
              entry.autodrain();
            }else{
              let fnsp = f.split(".");
              let fext = fnsp.pop();
              let fbsn = fnsp.join(".");
              let p = dest_dir + path.sep + ((fbsn == zip_fbsn) ? f : f.replace(zip_fbsn_reg, ""));
              await fsx.mkdirp(path.dirname(p));
              entry.pipe(fs.createWriteStream(p));
              files.push(p);
            }
          }catch(e){
            entry.autodrain();
          }
        })
        .promise()
        .then((r) => {
          res(files);
        })
        .catch((e) => {
          console.error(e);
          rej(e);
        })
      ;
    })
  }

  async rotate_directory(dir, limit){
    let ens = await fsp.readdir(dir);
    let dd = [];
    let lm = limit || 40;

    for(let en of ens){
      let pt = dir + path.sep + en;
      let st = await fsp.stat(pt);
      dd.push({
        path: pt,
        mtime: st.mtime.getTime()
      });
    }

    dd = dd.sort((a, b) => {
      return (a.mtime < b.mtime) ? 1 : -1;
    });

    if(dd.length > lm){
      return Promise.all(dd.slice(lm || 5).map((a) => {
        return new Promise((res, rej) => {
          console.log("Removing old files =>", a.path);
          fsx.remove(a.path).then(res).catch(rej);
        })
      })).catch((e) => {
        console.error(e);
      });
    }

    return true;
  }


}

class DestinationEntry {
  constructor(o){
    var ovr = o || {};
    this.id = ovr.id || "";
    this.label = ovr.label || "";
    this.email = ovr.email || "";
    this.attachment = ovr.attachment || [];
    this.attachment_mutual = ovr.attachment_mutual || [];
    this.attr = ovr.attr || {};
    this.clean();
  }

  clean(){
    ['id', 'label', 'email'].map((k) => {
      this[k] = (this[k] || "").trim();
    });
  }

  bind(dst, cols){
    var hd = cols || [];
    var hdsel = hd.slice(0, 3);
    if(hdsel.length == 3){
      this.id = dst[hdsel[0]];
      this.label = dst[hdsel[1]];
      this.email = dst[hdsel[2]];
    }
    this.clean();

    var hdatt = hd.slice(0);
    if(hdatt.length){
      hdatt.map((a, i) => {
        this.attr[a] = dst[a];
      });
    }
  }

  format(str){
    let bs = ['id', 'label', 'email'];
    for(var k in this.attr){
      if(bs.includes(k)) continue;
      str = str.replace("%" + k  + "%", this.attr[k]);
    }
    bs.forEach((a) => {
      str = str.replace("%" + a  + "%", this[a] || "");
    });
    return str;
  }

  append_attachment(att){
    var row = this;
    if(att.type == "dir"){
      for(var cnt of att.content){
        row.append_attachment(cnt);
      }
    }else{
      row.attachment.push(att);
    }
  }

  append_attachment_mutual(data_attachment_mutual){
    for(let att of data_attachment_mutual){
      if(att.type == "dir"){
        this.append_attachment_mutual(att.content);
      }else{
        this.attachment_mutual.push(att);
      }
    }
    return this.attachment_mutual;
  }

  clean_string(str){
    return (str || "").trim().split(path.sep).join("_").replace(/(　| )/g, "");
  }

};


