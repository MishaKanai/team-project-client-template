import React from 'react';
import {
    getUserDocuments,
    getCollections,
    postCollection,
    postDocumentToUser,
    getCollectionDocuments,
    postDocumentToCollection,
    deleteUserDocument,
    deleteCollectionDocument,
    deleteUserCollection
} from '../server';

import {Link, withRouter, Route} from 'react-router';
//import rasterizeHTML from 'rasterizehtml';
import NewDocForm from './NewDocForm'
import NewCollectionModal from './NewCollectionModal'

class SavedDocumentsI extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            documents: [],
            collections: [],
        }
        if (typeof document !== 'undefined') {
            this.rasterizeHTML = require('rasterizehtml');
        }
    }

    componentDidMount() {
        if (this.props.collId) {
            //collection view
            getCollectionDocuments(this.props.collId, (docs) => {
                this.setState({documents: docs});
            });
        } else {
            //user level view
            getCollections(this.props.userId, (colls) => {
                this.setState({collections: colls});
            });
            getUserDocuments(this.props.userId, (docs) => {
                this.setState({documents: docs});
            });
        }
    }

    componentDidUpdate() {
        const rasterizeHTML = this.rasterizeHTML;
        if (rasterizeHTML)
            this.state.documents.forEach((doc) => {
                rasterizeHTML.drawHTML(doc.text, document.getElementById('canvas_' + doc._id));
            });
    }

    deleteDocument(docId) {
        const cb = (documents) => {
            this.setState({documents: documents});
        };
        if (this.props.collId) {
            deleteCollectionDocument(this.props.userId, this.props.collId, docId, cb);
        } else {
            deleteUserDocument(this.props.userId, docId, cb);
        }
    }

    deleteCollection(collId) {
        const cb = (collections) => {
            this.setState({collections: collections});
        };
        deleteUserCollection(this.props.userId, collId, cb);

    }

    handleNewDocument(documentName) {
        const now = Date.now();
        if (this.props.collId) {
            //Collection view
            postDocumentToCollection(this.props.collId, documentName, '', now, (doc) => {
                this.setState((state) => {
                    return {
                        documents: state.documents.concat([doc])
                    }
                });
                this.props.router.push('/workspace/' + doc._id);
            });
        } else {
            //user view
            postDocumentToUser(this.props.userId, documentName, '', now, (doc) => {
                this.setState((state) => {
                    return {
                        documents: state.documents.concat([doc]),
                        collections: state.collections

                    }
                });
                console.log(doc._id);
                this.props.router.push('/workspace/' + doc._id);
            });
        }

    }

    handleNewCollection(collectionName) {
        if (this.props.collId) {
            console.log('error: NO NESTED COLLECTIONS. aborting function call');
            return;
        }
        postCollection(this.props.userId, collectionName, (coll) => {
            this.setState({
                collections: this.state.collections.concat([coll])
            });
        });

    }

    render() {
        return (
            <div>

                <div className="item col-md-12 add-new-doc-btn" id="new-item-button-row">
                    <div className="row">
                        <button type="button" className="btn" data-toggle="modal" data-target='#newDocModal'>New Document</button>
                        {this.props.collId
                            ? null
                            : <button type="button" className="btn" data-toggle="modal" data-target='#newCollModal'>New Collection</button>
}

                    </div>
                </div>

                <div className="row list-group" id="documents">
                    <ul className="document-list">
                        {this.state.documents.map((doc, i) => <div className="item  col-xs-4 col-lg-4" key={i}>
                            <div className="thumbnail">
                                <Link to={"/workspace/" + doc._id}>
                                    <canvas id={'canvas_' + doc._id} key ={999 + doc._id} className="group list-group-image"></canvas>
                                    <div className="caption">
                                        <h4 className="group inner list-group-item-heading">
                                            <span className="glyphicon glyphicon-file" id="saved-docs-glyphicon"></span>
                                            {doc.title}
                                        </h4>
                                    </div>
                                </Link>
                                <span className="btn del-btn" data-toggle="modal" data-target={"#deleteWorkspace" + doc._id}>
                                    <span className="glyphicon glyphicon-remove"></span>
                                </span>
                            </div>

                            {/* MODAL DELETE WORKSPACE */}
                            <div id={"deleteWorkspace" + doc._id} className="modal fade del-doc-modal" role="dialog">
                                <div className="modal-dialog">
                                    <div className="modal-content">
                                        <div className="modal-header">
                                            <button type="button" className="close" data-dismiss="modal">&times;</button>
                                            <h4 className="modal-title">Are you sure you want to delete the document "{doc.title}"?</h4>
                                        </div>
                                        <div className="modal-body del-doc-modal-body">
                                            <button type="button" className="btn btn-danger del-doc-modal-btn" data-dismiss="modal" onClick={() => this.deleteDocument(doc._id)}>Delete Document</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>)
}
                        {this.props.collId
                            ? null
                            : <div className="item  col-xs-4 col-lg-4" key={this.state.documents.length + 1}>
                                <div className="thumbnail">
                                    {this.state.collections.map((coll, i) => <div className="collection-thumbnail">

                                        <Link to={"/collections/" + coll._id} key={i}>
                                            <div className="caption">
                                                <h4 className="group inner list-group-item-heading">
                                                    <span className="glyphicon glyphicon-folder-open" id="saved-docs-glyphicon"></span>
                                                    {' ' + coll.name}
                                                </h4>
                                            </div>
                                        </Link>
                                        <span className="btn del-btn-coll" data-toggle="modal" data-target={"#deleteCollection" + coll._id}>
                                            <span className="glyphicon glyphicon-remove"></span>
                                        </span>

                                        {/* MODAL DELETE Collection */}
                                        <div id={"deleteCollection" + coll._id} className="modal fade del-doc-modal" role="dialog">
                                            <div className="modal-dialog">
                                                <div className="modal-content">
                                                    <div className="modal-header">
                                                        <button type="button" className="close" data-dismiss="modal">&times;</button>
                                                        <h4 className="modal-title">Are you sure you want to delete the collection "{coll.name}"?</h4>
                                                    </div>
                                                    <div className="modal-body del-doc-modal-body">
                                                        <button type="button" className="btn btn-danger del-doc-modal-btn" data-dismiss="modal" onClick={() => this.deleteCollection(coll._id)}>Delete Collection</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>)
}
                                </div>
                            </div>
}
                    </ul>
                </div>

                <div id="newDocModal" className="modal fade" role="dialog">

                    <div className="modal-dialog pwd-box">
                        <div className="modal-content">
                            <div className="modal-header">
                                <button type="button" className="close" data-dismiss="modal">&times;</button>
                                <h4 className="modal-title">Name Document</h4>
                            </div>
                            <NewDocForm id='newDocForm' onSubmit={(value) => {
                                this.handleNewDocument(value)
                            }}/>
                        </div>
                    </div>
                </div>

                <div id="newCollModal" className="modal fade" role="dialog">

                    <div className="modal-dialog pwd-box">
                        <div className="modal-content">
                            <div className="modal-header">
                                <button type="button" className="close" data-dismiss="modal">&times;</button>
                                <h4 className="modal-title">Name Collection</h4>
                            </div>
                            <NewCollectionModal id='newCollForm' onSubmit={(value) => {
                                  this.handleNewCollection(value)
                            }}/>
                        </div>
                    </div>
                </div>

            </div>

        )
    }
}

export var SavedDocuments = withRouter(SavedDocumentsI);
SavedDocumentsI.propTypes = {
    router: React.PropTypes.shape({push: React.PropTypes.func.isRequired}).isRequired
};
