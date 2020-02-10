import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import * as utpl from 'uri-templates';
import { URITemplate } from 'uri-templates';
import { AppService, RequestHeader } from '../app.service';
import * as HttpStatus from 'http-status-codes';

export enum EventType {FillUriTemplate, FillHttpRequest}

export enum Command {Get, Post, Put, Patch, Delete, Document}

export class UriTemplateEvent {
  constructor(public type: EventType, public templatedUri, public parameters: UriTemplateParameter[]) {
  }
}

export class HttpRequestEvent {
  constructor(public type: EventType, public command: Command,
              public uri: string, public jsonSchema?: any, public halFormsTemplates?: any) {
  }
}

export class UriTemplateParameter {
  constructor(public key: string, public value: string) {
  }
}

@Injectable()
export class RequestService {

  private httpResponse: HttpResponse<any>;
  private responseSubject: Subject<HttpResponse<any>> = new Subject<HttpResponse<any>>();
  private responseObservable: Observable<HttpResponse<any>> = this.responseSubject.asObservable();

  private needInfoSubject: Subject<any> = new Subject<any>();
  private needInfoObservable: Observable<any> = this.needInfoSubject.asObservable();

  private documentationSubject: Subject<string> = new Subject<string>();
  private documentationObservable: Observable<string> = this.documentationSubject.asObservable();

  private requestHeaders: HttpHeaders = new HttpHeaders(
    {
      Accept: 'application/prs.hal-forms+json, application/hal+json, application/json, */*'
    } );
  private customRequestHeaders: RequestHeader[];

  constructor(private appService: AppService, private http: HttpClient) {
  }

  public getResponseObservable(): Observable<HttpResponse<any>> {
    return this.responseObservable;
  }

  public getNeedInfoObservable(): Observable<any> {
    return this.needInfoObservable;
  }

  public getDocumentationObservable(): Observable<string> {
    return this.documentationObservable;
  }

  public getUri(uri: string) {
    if (!uri || uri.trim().length === 0) {
      return;
    }
    this.processCommand( Command.Get, uri );
  }

  public requestUri(uri: string, httpMethod: string, body?: string) {

    let headers = this.requestHeaders;
    if (httpMethod.toLowerCase() === 'post' || httpMethod.toLowerCase() === 'put' || httpMethod.toLowerCase() === 'patch') {
      headers = headers.set( 'Content-Type', 'application/json; charset=utf-8' );
    }
    this.appService.setUri( uri );
    this.http.request( httpMethod, uri, { headers, observe: 'response', body } ).subscribe(
      (response: HttpResponse<any>) => {
        (response as any).statusText = HttpStatus.getStatusText( response.status );
        this.httpResponse = response;
        this.responseSubject.next( response );
      },
      (error: HttpErrorResponse) => {
        let statusText = '';
        if (error.status !== 0) {
          statusText = HttpStatus.getStatusText( error.status );
        }

        if (error.error instanceof ErrorEvent) {
          console.error( 'An error event occurred:', error.error.message );
        } else {
          // console.error(`Backend returned code ${error.status}, body: ${error.error}`);
          let errorBody = '';
          if (error.status !== 0) {
            if (error.error && error.error.text) {
              errorBody = error.error.text;
            } else {
              errorBody = error.error;
            }
          }

          this.httpResponse = new HttpResponse( {
            body: errorBody, headers: error.headers,
            status: error.status, statusText, url: error.url
          } );
          this.responseSubject.next( this.httpResponse );
        }
      }
    );
  }

  public processCommand(command: Command, uri: string, halFormsTemplates?: any) {
    if (command === Command.Get) {
      if (uri.includes( '{' )) {
        const uriTemplate: URITemplate = utpl( uri );
        const uriTemplateParameters: UriTemplateParameter[] = new Array();
        for (const param of (uriTemplate as any).varNames) {
          uriTemplateParameters.push( new UriTemplateParameter( param, '' ) );
        }

        const event = new UriTemplateEvent( EventType.FillUriTemplate, uri, uriTemplateParameters );
        this.needInfoSubject.next( event );
        return;
      }

      this.requestUri( uri, 'GET' );
    } else if (command === Command.Post || command === Command.Put || command === Command.Patch) {
      if (uri.includes( '{' )) {
        uri = uri.substring( 0, uri.indexOf( '{' ) );
      }
      const event = new HttpRequestEvent( EventType.FillHttpRequest, command, uri );
      this.getJsonSchema( event );
      if (halFormsTemplates) {
        this.getHalFormsTemplates( event, halFormsTemplates );
      }
      return;

    } else if (command === Command.Delete) {
      if (uri.includes( '{' )) {
        uri = uri.substring( 0, uri.indexOf( '{' ) );
      }
      this.requestUri( uri, 'DELETE' );

    } else if (command === Command.Document) {
      this.documentationSubject.next( uri );
    } else {
      console.log( ('got Command: ' + command) );
    }
  }

  public getJsonSchema(httpRequestEvent: HttpRequestEvent) {
    this.http.request( 'HEAD', httpRequestEvent.uri,
      { headers: this.requestHeaders, observe: 'response' } ).subscribe(
      (response: HttpResponse<any>) => {
        let hasProfile = false;
        const linkHeader = response.headers.get( 'Link' );
        if (linkHeader) {
          const w3cLinks = linkHeader.split( ',' );
          let profileUri;
          w3cLinks.forEach( (w3cLink) => {
            const parts = w3cLink.split( ';' );

            const hrefWrappedWithBrackets = parts[0];
            const href = hrefWrappedWithBrackets.slice( 1, parts[0].length - 1 );

            const w3cRel = parts[1];
            const relWrappedWithQuotes = w3cRel.split( '=' )[1];
            const rel = relWrappedWithQuotes.slice( 1, relWrappedWithQuotes.length - 1 );

            if (rel.toLowerCase() === 'profile') {
              profileUri = href;
            }
          } );

          if (profileUri) {
            hasProfile = true;
            let headers = new HttpHeaders(
              {
                Accept: 'application/schema+json'
              } );

            if (this.customRequestHeaders) {
              for (const requestHeader of this.customRequestHeaders) {
                headers = headers.append( requestHeader.key, requestHeader.value );
              }
            }

            this.http.get( profileUri, { headers, observe: 'response' } ).subscribe(
              (httpResponse: HttpResponse<any>) => {
                const jsonSchema = httpResponse.body;

                // this would be for removing link relations from the POST, PUT and PATCH editor
                //
                // Object.keys(jsonSchema.properties).forEach(function (property) {
                //   if (jsonSchema.properties[property].hasOwnProperty('format') &&
                //     jsonSchema.properties[property].format === 'uri') {
                //     delete jsonSchema.properties[property];
                //   }
                // });

                // since we use those properties to generate a editor for POST, PUT and PATCH,
                // "readOnly" properties should not be displayed
                Object.keys( jsonSchema.properties ).forEach( (property) => {
                  if (jsonSchema.properties[property].hasOwnProperty( 'readOnly' ) &&
                    jsonSchema.properties[property].readOnly === true) {
                    delete jsonSchema.properties[property];
                  }
                } );

                httpRequestEvent.jsonSchema = jsonSchema;
                this.needInfoSubject.next( httpRequestEvent );
              },
              () => {
                console.error( 'Cannot get JSON schema for:', profileUri );
                this.needInfoSubject.next( httpRequestEvent );
              }
            );
          }
        }

        if (!hasProfile) {
          this.needInfoSubject.next( httpRequestEvent );
        }
      },
      () => {
        this.needInfoSubject.next( httpRequestEvent );
      }
    );
  }

  public getHalFormsTemplates(httpRequestEvent: HttpRequestEvent, halFormsTemplate: any) {
    httpRequestEvent.halFormsTemplates = halFormsTemplate;
  }

  public setCustomHeaders(requestHeaders: RequestHeader[]) {
    this.customRequestHeaders = requestHeaders;
    this.requestHeaders = new HttpHeaders();
    let addDefaultAcceptHeader = true;
    for (const requestHeader of requestHeaders) {
      if (requestHeader.key.toLowerCase() === 'accept') {
        addDefaultAcceptHeader = false;
      }
      this.requestHeaders = this.requestHeaders.append( requestHeader.key, requestHeader.value );
    }
    if (addDefaultAcceptHeader === true) {
      this.requestHeaders = this.requestHeaders.append(
        'Accept', 'application/prs.hal-forms+json, application/hal+json, application/json, */*' );
    }
  }

  public getInputType(jsonSchemaType: string, jsonSchemaFormat?: string): string {
    switch (jsonSchemaType.toLowerCase()) {
      case 'integer':
        return 'number';
      case 'string':
        if (jsonSchemaFormat) {
          switch (jsonSchemaFormat.toLowerCase()) {
            // The following enables the dat time editor in most browsers
            // I have disabled this because the date time formats
            // are often very different, so type=text is more flexible
            //
            // case 'date-time':
            //   return 'datetime-local';
            case 'uri':
              return 'url';
          }
        }
        return 'text';

      default:
        return 'text';
    }
  }
}
