Vue.component('component-form', {
  template: $('#template--component-form').html(),
  props: ['form'],
  created(){
  },
  methods: {
  }
});

Vue.component('component-form-dest-list', {
  template: $('#template--component-form-dest-list').html(),
  props: ['form'],
  methods: {
    update: (e) => {
      let el = $(e.target);
      let label = el.val().replace(new RegExp("\\\\", "g"), '/').replace(/.*\//, '');
      if(label){
        el.siblings('.custom-file-label').text(label);
      }else{
        el.siblings('.custom-file-label').text("Select File");
      }
    }
  }
});

Vue.component('component-form-attachment', {
  template: $('#template--component-form-attachment').html(),
  props: ['form'],
  methods: {
    update: (e) => {
      let el = $(e.target);
      let label = el.val().replace(new RegExp("\\\\", "g"), '/').replace(/.*\//, '');
      if(label){
        el.siblings('.custom-file-label').text(label);
      }else{
        el.siblings('.custom-file-label').text("Select File");
      }
    }
  }
});

Vue.component('component-form-attachment-mutual', {
  template: $('#template--component-form-attachment-mutual').html(),
  props: ['form'],
  methods: {
    update: (e) => {
      let el = $(e.target);
      let label = el.val().replace(new RegExp("\\\\", "g"), '/').replace(/.*\//, '');
      if(label){
        el.siblings('.custom-file-label').text(label);
      }else{
        el.siblings('.custom-file-label').text("Select File");
      }
    }
  }
});

Vue.component('component-form-replacer', {
  template: $('#template--component-form-replacer').html(),
  props: ['form'],
  methods: {
  }
});

