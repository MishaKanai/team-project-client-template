import React from 'react';

/**
 * If shouldHide is true, returns a CSS class that hides the element.
 */
function hideElement(shouldHide) {
    if (shouldHide) {
        return 'hidden';
    } else {
        return '';
    }
}


export default class ErrorBanner extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            active: false,
            errors: ""
        };

        // ASSUMPTION: There is only one ErrorBanner component ever created.
        // By assigning to 'window', this is a global function. Global functions
        // are not typically a good idea, but they can be useful for adding basic
        // error handling to an application
        if (typeof window !== 'undefined') {
            window.WordSmithError = (errorText) => {
                this.setState({
                    active: true,
                    error: errorText
                })
            };
        }
    }

    render() {
        return (
                <div className={"alert alert-warning " + hideElement(!this.state.active)} role="alert">
                WordSmith was unable to complete a recent request: {this.state.error}<br />
                Please <a onClick={() => window.location.reload()}>refresh the web page</a> and try again.
                </div>
        );
    }
}
