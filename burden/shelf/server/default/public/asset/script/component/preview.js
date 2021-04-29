Vue.component('component-preview', {
  template: $('#template--component-preview-content').html(),
  props: ['registered', 'sending'],
  data(){
    let limit = 10;
    let rcd = this.sending.list.length;
    let pgs = Math.floor(rcd / limit);
    return {
      page: 1,
      per_page: limit,
      pages: pgs >= 1 ? (rcd > (limit * pgs) ? (pgs + 1) : pgs) : 1
    }
  },
  created(){
  },
  computed: {
    sending_count(){
      return this.sending.list.length;
    },
    sending_preview(){
      return this.sending.list.slice((this.per_page * (this.page - 1)), (this.per_page * this.page))
    }
  },
  methods: {
    toggle_page(e){
      let el =$ (e.target);
      this.page = parseInt(el.text());
    }
  }
});
