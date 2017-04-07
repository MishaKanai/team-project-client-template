import React from 'react';
import TextEditor from './TextEditor';
import SuggestionsBar from './SuggestionsBar';
import {putDocument, getDocument} from '../server';
class Workspace extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            //we will store info returned from api here.
            title: "...",
            info: [],
            category:"rhyme",
            word:"",
            text: "..."
        }
    }
    getRhymes(word) {
        $.ajax({
            url: this.props.rhymeAPIprefix + word,
            dataType: 'json',
            cache: true,
            success: function(data) {
                //this.setState({info: JSON.stringify(data)});
                this.setState({info: data});
            }.bind(this),
            error: function(xhr, status, err) {
                console.error(this.props.url, status, err.toString());
            }.bind(this)
        });
        //alert("{"+this.state.word+"}" + this.state.info)
    }
    getCategory(cat) {
      this.setState({category:cat})
      switch(cat){
        case "rhyme":
          if(this.state.info.length != 0){
            this.getRhymes(this.state.word)
          }
          break;
        case "synonym":
          this.setState({info: []});
          break;
        case "definition":
          this.setState({info: []});
          break;
        case "slang":
          this.setState({info: []});
          break;
    }
    }
    getWord(w) {
      this.setState({word:w})
      if(this.state.category==="rhyme"){
        this.getRhymes(w)
      }
    }
    componentDidMount() {
        getDocument(this.props.docId, (doc) => this.setState({
            title: doc.title,
            text: doc.text
        }));
    }
    handleChange(event) {
        this.setState({text: event});
    }
    saveDoc() {
        const docId = this.props.docId;
        const title = this.state.title;
        const text = this.state.text;
        putDocument(docId, title, text, Date.now(), () => {
            //TODO:
            //grey out save button until next handleChange
        });
    }
    render() {
      var sugArr = []
      for (var i=0; i < 20; i++){
        sugArr.push("...")
      }
        return (<div className='workspace-inner-wrapper container'>

                <row>

                <div className='col-md-8 leftcol'>
                <row>
                <h3 id='doc-title'>{' '+this.state.title}</h3>
                <span id='saveBtn' onClick={() => this.saveDoc()} className='btn'>save</span>
                </row>
                <TextEditor
                    docId={this.props.docId}
                    value={this.state.text}
                    onChange={(e) => this.handleChange(e)}
                    getRhymes={(word)=>this.getRhymes(word)}
                    getCategory={(x) => this.getCategory(x)}
                    getWord={(x) => this.getWord(x)}
                />
                </div>
                <SuggestionsBar
                    word={this.state.word}
                    active={this.state.category}
                    updateCategory={(x) => this.getCategory(x)}
                    allSuggestions={this.state.info.map((x) => x.word)}
                />

                </row>

                </div>)
    }
}

export default Workspace;
