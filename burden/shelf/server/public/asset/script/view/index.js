(() => {

  var Config = {
    server: {
      host: "smtp-relay.gmail.com"
    }
  };

  new Vue({
    el: '#main',
    data(){
      return {
        form: this,
        replacer: [],
        config: Config,
        registered: null,
        sending: {},
        sent: []
      }
    },
    methods: {
      async send_mail(){
        var vm = this;
        // will be used for each request too.
        var conf = retrieve_config_value();

        var data;
        try{
          data = await request_presend_data(conf);
          if(!data || !data.list){
            throw new Error("送信情報リストの作成に失敗しました。");
          }
          console.log("data is", data);
          vm.active_timestamp = data.timestamp;
        }catch(e){
          dialog_error(e);
          return false;
        }
        show_presend_alert().then((c) => {
          if(!c.value){
            return;
          }
          vm.active_modal = Swal.fire({
            html: '<div class="progress" style="height: 16px;">'
            + '<div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" id="progress-send_mail"></div>'
            + '</div>'
            + '<div id="progress-bar-status" class="text-muted" style="font-family: monospace; font-size: 10px;"></div>',
            showConfirmButton: false,
            showCloseButton: false,
            allowOutsideClick: false,
            showCancelButton: true,
            focusConfirm: false,
            cancelButtonText: 'Cancel',
            onOpen: () => {
              start_send_mail(vm, data, conf);
            }
          });
        });

      },
      async preview(){
        try{
          var vm = this;
          let data = await request_registered_data();
          this.sending = data;
          show_preview_table(vm).then((r) => {
            console.log(r);
          });
        }catch(e){
          dialog_error(e);
        }
      },
      async register(){
        try{
          let r = await request_register_attachment();
          this.registered = r;
          Swal.fire({
            icon: 'success',
            title: 'Success',
            text: 'アップロードが完了しました。設定を完了してメール送信してください。',
          });
        }catch(e){
          dialog_error(e);
        }
      },
      async send(){
        try{
          //let r = await send_one();
        }catch(e){
        }
      },
      async download(){
        try{
          let r = await retrieve_packed_zip();
          if(r.data.download_path){
            window.open(window.location.protocol + "//" + window.location.host + "/" + r.data.download_path);
          }
        }catch(e){
          dialog_error(e);
        }
      },
      async download_last_result(){
        download_last_result(this.active_timestamp);
      }
    }
  });

  async function download_last_result(timestamp){
    var res = await request_result_csv({
      timestamp: timestamp
    });
    if(res.csv){
      download("result_" + timestamp + ".csv", res.csv);
    }
  }

  function show_presend_alert(){
    return Swal.fire({
      icon: 'warning',
      html: 'メール送信を開始します。'
      + '<p class="text-muted"><small>送信情報リストのプレビューで、送信内容を確認してください。</small></p>',
      showCloseButton: true,
      showCancelButton: true,
      focusConfirm: false,
      confirmButtonText: '<i class="fa fa-thumbs-up"></i> Let\'s Go.',
      cancelButtonText: '<i class="fa fa-thumbs-down"></i> Cancel',
    })
  }

  function show_preview_table(vm){
    return Swal.fire({
      customClass: 'swal-auto',
      icon: null,
      html: ''
      + '<div id="preview">'
      + '<div class="form-group">'
      + '<div class="input-group">'
      + '<select id="preview-filter-col" v-on:change="filter" class="custom-select form-control col-md-2"></select>'
      + '<input id="preview-filter-val" class="form-control col-md-10" v-on:change="filter">'
      + '</div>'
      + '</div>'
      + '<div class="tabulator"><div class="tabulator-footer"><div id="preview-table-paginator"></div></div></div>'
      + '<div id="preview-table" style="min-height: 400px; height: 60vh;">'
      + '</div>'
      + '</div>',
      onOpen: () => {
        new Vue({
          el: '#preview',
          data(){
            return {
              registered: this.registered,
              sending: vm.sending
            };
          },
          methods: {
            async filter(){
              var fil_col = $('#preview-filter-col').val();
              var fil_val = $('#preview-filter-val').val();
              console.log("filter", fil_col, fil_val);
              if(fil_col && fil_val){
                vm.tabulator.setFilter(fil_col, "like", fil_val);
              }else{
                vm.tabulator.clearFilter();
              }
            },
          }
        });

        var fds = ['id', 'label', 'email'];
        for(var f of fds){
          var ht = '<option value="' + f + '">' + f + '</option>';
          var dm = $(ht);
          if(f == 'label') dm.attr("selected", "selected");
          $("#preview-filter-col").append(dm);
        }

        vm.tabulator = new Tabulator('#preview-table', {
          data: vm.sending.list,
          layout:"fitColumns",
          responsiveLayout:"hide",
          tooltips: true,
          addRowPos:"top",          //when adding a new row, add it to the top of the table
          history:true,             //allow undo and redo actions on the table
          paginationElement: document.getElementById("preview-table-paginator"),
          pagination: "local",
          paginationSize: 10,
          movableColumns:true,      //allow column order to be changed
          resizableRows:true,       //allow row order to be changed
          initialSort:[             //set the initial sort order of the data
            //{column:"name", dir:"asc"},
          ],
          columns:[                 //define the table columns
            {title:"ID", field:"id"},
            {title:"Name", field:"label"},
            {title:"E-Mail", field:"email"},
            {title:"Attachment", field:"attachment", formatter: (cell) => {
              var row = cell.getRow();
              var data = row.getData();
              var html = "";
              console.log("data", data);
              for(var att of data.attachment){
                html += ''
                  + '<div v-for="att of info.attachment">'
                  + '<small><i class="fas fa-user-lock"></i>&nbsp;'
                  + att.entity + att.type + '</small></div>';
              }
              for(var att of data.attachment_mutual){
                html += ''
                  + '<div v-for="att of info.attachment">'
                  + '<small><i class="fas fa-retweet"></i>&nbsp;'
                  + att.entity + att.type + '</small></div>';
              }

              return html;
            }},
          ],
        });

      }
    });
  }

  async function start_send_mail(vm, data, conf){
    var aborted = false;

    // reset
    vm.sent = [];

    vm.active_modal.then((result) => {
      if(result.dismiss){
        aborted = true;
      }
    });

    let per = 0;
    let completed = 0;
    let total = data.list.length;

    var upd_prg = (per, s, t) => {
      $('#progress-bar-status').html(''
        + '<section class="mt-1">'
        + '<div>' + (Math.round(per * 10) / 10) + ' % = [ ' + (completed) + ' / ' + total + ' ]</div>'
        + (s ? ("<div>sending to " + s.label + " [" + s.email + "]...</div>") : "")
        + (t ? ("<div>" + t + "</div>") : "")
        + '</section>'
      );
      $('#progress-send_mail').css('width', per + '%');
    };

    // binding beforeunload
    var confirmation = confirm_beforeunload("プロセスが進行中ですが、ウィンドウを閉じてもよろしいですか？");
    $(window).on('beforeunload', confirmation);

    for(var s of data.list){
      if(aborted){
        break;
      }
      s.result = {
        data: null,
        error: null
      };
      try{
        conf.timestamp = vm.active_timestamp;
        upd_prg(per, s);
        var r = await request_send_mail_each(s, conf);
        s.result.data = r;
      }catch(e){
        console.error(e);
        s.result.error = e;
      }
      completed++;
      vm.sent.push(s);
      per = (completed / total) * 100;
      upd_prg(per, s);
    }

    $(window).off('beforeunload', confirmation);

    var dialog;
    var dcn = {
      confirmButtonText: "結果をダウンロード",
      allowOutsideClick: false,
      allowEscapeKey: false
    };
    if(aborted){
      dialog = Swal.fire(Object.assign(dcn, {
        icon: 'warning',
        text: '処理を中断しました。',
      }));
    }else{
      upd_prg(100, false, "Closing...");
      await FM.async.sleep(1000);
      dialog = Swal.fire(Object.assign(dcn, {
        icon: 'info',
        text: '処理が完了しました。'
      }));
    }

    dialog.then(async () => {
      download_last_result(vm.active_timestamp);
    });

  }

  function confirm_beforeunload(msg){
    return (e) => {
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    }
  }

  function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  function dialog_error(e){
    return Swal.fire({
      icon: 'error',
      title: 'Oops...',
      text: "Error: " + e.message
    });
  }

  function notification(p){
    return Swal.fire(Object.assign({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      showCloseButton: false,
      showCancelButton: false,
    }, p));
  }

  function request(url, param){
    let f = new FormData();
    for(let k in param){
      f.append(k, param[k]);
    }
    return (new Promise((res, rej) => {
      $.ajax({
        type: "post",
        url: url,
        data: f,
        processData: false,
        contentType: false,
        complete: (r) => {
          var result = r.responseJSON || false;
          console.log("REQUEST() RESULT", result);
          if(!result || (result && result.error)){
            rej(new Error( !result ? "EMPTY" : (result.error.detail || result.error) ));
          }else{
            res(result.data);
          }
        },
        error: (r) => {
          rej(r);
        }
      });
    }));
  }

  function request_gently(url, p){
    let note = notification({
      title: ''
        + '<div class="d-flex align-items-center">'
        + '<div class="spinner-border ml-auto text-primary"'
          + ' role="status" aria-hidden="true" style=""></div>'
        + '&nbsp;&nbsp;<span style="font-size: 1rem;">Loading...</span>'
        + '</div>'
      //'<h5><span class="spinner-border text-primary" role="status"></span>Loading...</h5>'
    });
    return request(url, p)
      .then((r) => {
        note.close();
        return r;
      })
      .catch((e) => {
        note.close();
        throw e;
      });
  }


  function request_send_mail_each(dst, conf){
    var f = new FormData();
    var param = Object.assign({
      mode: 'send_mail',
      token: ACCESS_TOKEN,
      timestamp: conf.timestamp,
      target_id: dst.id,
      target_label: dst.label,
      target_email: dst.email,
    }, conf);
    return request("/run/form_handler", param);
  }

  function request_register_attachment(){

    let destlist = $('#file-dest-list')[0].files[0];
    if(!destlist){
      throw new Error("送信先リストを選択してください。");
    }

    let attachment = $('#file-attachment')[0].files[0];

    let f = new FormData();
    let p = {
      mode: 'register_attachment',
      token: ACCESS_TOKEN,
      destlist: destlist,
      attachment: attachment,
    };

    let el_fam = $('#file-attachment-mutual');
    if(el_fam[0].files){
      p.attachment_mutual = el_fam[0].files[0];
    }

    return request_gently("/run/form_handler", p);
  }

  function request_presend_data(conf){
    if(conf.debug){
      if(!conf.debug_taget_email){
        throw new Error("デバッグ用のメールアドレスが未設定です");
      }
    }
    if(!conf.sender_email){
      throw new Error("送信元を設定してください。");
    }
    if(!conf.mail_subject){
      throw new Error("メール件名を設定してください。");
    }
    if(!conf.mail_body){
      throw new Error("メール本文を設定してください。");
    }
    return request_registered_data({
      mode: 'send_mail_prepare'
    });
  }

  function request_registered_data(ov){
    let conf = retrieve_config_value();
    if(!conf.query_type){
      throw new Error("基準となるリストが選択されていません。");
    }
    return request_gently("/run/form_handler", Object.assign({
      token: ACCESS_TOKEN,
      mode: 'fetch_info',
    }, conf, ov));
  }

  function request_result_csv(p){
    return request_gently("/run/form_handler", {
      token: ACCESS_TOKEN,
      mode: 'generate_result_csv',
      timestamp: p.timestamp
    });
  }

  function retrieve_config_value(){
    return {
      debug: $('[name="debug"]').is(':checked') || "",
      debug_taget_email: $('[name="debug_target_email"]').val(),
      query_format: $('#form-input-query-format').val(),
      query_type: $('#form-input-query-type').val(),
      server_host: $('[name="server_host"]').val(),
      server_port: $('[name="server_port"]').val(),
      server_user: $('[name="server_user"]').val(),
      server_password: $('[name="server_password"]').val(),
      sender_email: $('[name="sender_email"]').val(),
      sender_display_name: $('[name="sender_display_name"]').val(),
      mail_subject: $('[name="mail_subject"]').val(),
      mail_body: $('[name="mail_body"]').val(),
      mail_body_type: $('[name="mail_body_type"]').val(),
      config_require_personal_attachment: $('[name="config_require_personal_attachment"]').is(':checked') || "",
      attachment_with_password: $('[name="attachment_with_password"]').is(':checked') || "",
      attachment_locked_file_name: $('[name="attachment_locked_file_name"]').val()
    }
  }

})();
