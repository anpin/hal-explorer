import { ComponentFixture, getTestBed, TestBed, waitForAsync } from '@angular/core/testing';

import { DocumentationComponent, getDocHeight } from './documentation.component';
import { RequestService } from '../request/request.service';
import { DomSanitizer } from '@angular/platform-browser';

class ObservableMock {
  private callback: (value: any) => void;
  hasSubscribed = false;

  subscribe(next?: (value: any) => void, error?: (error: any) => void) {
    this.callback = next;
    this.hasSubscribed = true;
  }

  next(input: any) {
    this.callback( input );
  }
}

class RequestServiceMock {
  responseObservableMock: ObservableMock = new ObservableMock();
  documentationObservableMock: ObservableMock = new ObservableMock();

  getResponseObservable() {
    return this.responseObservableMock;
  }

  getDocumentationObservable() {
    return this.documentationObservableMock;
  }
}

class DomSanitizerMock {
  bypassSecurityTrustResourceUrl(docUri) {
    return docUri;
  }
}

describe( 'DocumentationComponent', () => {
  let component: DocumentationComponent;
  let fixture: ComponentFixture<DocumentationComponent>;

  beforeEach( waitForAsync( () => {
    TestBed.configureTestingModule( {
      declarations: [DocumentationComponent],
      providers: [
        { provide: RequestService, useClass: RequestServiceMock },
        { provide: DomSanitizer, useClass: DomSanitizerMock }
      ]

    } )
      .compileComponents();
  } ) );

  beforeEach( () => {
    fixture = TestBed.createComponent( DocumentationComponent );
    component = fixture.componentInstance;
    fixture.detectChanges();
  } );

  it( 'should create', () => {
    expect( component ).toBeTruthy();
  } );

  it( 'should set doc uri', () => {
    const requestServiceMock: RequestServiceMock = getTestBed().inject( RequestService ) as any;

    requestServiceMock.documentationObservableMock.next( '/doc' );

    expect( component.docUri ).toEqual( '/doc' );
  } );

  it( 'should unset doc uri on response arrival', () => {
    const requestServiceMock: RequestServiceMock = getTestBed().inject( RequestService ) as any;

    requestServiceMock.documentationObservableMock.next( '/doc' );
    requestServiceMock.responseObservableMock.next( 'response' );

    expect( component.docUri ).toBeUndefined();
  } );

  it( 'should set iFrame height', () => {
    const iFrame = document.createElement( 'iframe' );
    const html = '<body>Foo</body>';
    iFrame.src = 'data:text/html;charset=utf-8,' + encodeURI( html );
    iFrame.id = 'doc-iframe';
    document.body.appendChild( iFrame );

    (window as any).setIframeHeight( iFrame.id );

    expect( iFrame.style.height ).toBe( '12px' );
  } );

  it( 'should get height', () => {
    const docHeight: number = getDocHeight( document );
    expect( docHeight ).toBe( 600 );
  } );

} );


