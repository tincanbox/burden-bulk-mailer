const path = require('path');

const Story = disc('class/Story');

module.exports = class extends Story {

  constructor(core){
    super(core);

    this.compose([
      "main"
    ]);

    this.config = {
    };

  }

  /*
   */
  async chapter_main(param){
    param.debug = true;

    try{
      let result = await this.action_send(param);
      return result;
    }catch(e){
      console.error(e);
      throw e;
    }
  }

  /**
   * Action
   * @param {*} param 
   */
  async action_send(param){

    let result = {
      status: false,
      entry: {},
      request: param,
      response: "",
      error: null
    };

    try{
      let transport_option = {
        name: 'burden-bulk-mailer',
        host: param.server_host,
        port: param.server_port || 587,
      };

      if (param.server_user && param.server_password) {
          transport_option.auth = {
              user: param.server_user,
              pass: param.server_password
          };
      }

      let content = {
        to: param.to,
        subject: param.subject || "Test",
        text: param.body || "This is test message."
      };

      // proc.
      let info = await this.send_mail(transport_option, content);
      result.response = info.response.split("\n").join(";");
      if(result.response.match(" ok ")){
        result.status = true;
      }
    }catch(e){
      result.error = e.message;
    }

    await FM.async.sleep(100);

    return result;
  }

  async send_mail(transport_option, content){
    let mailer = this.core.mail.engine;
    let transport = mailer.createTransport(transport_option);
    return await transport.sendMail(content);
  }

}
