import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Adds the bearer token to protected API requests. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();

  const authenticatedRequest =
    token
      ? request.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        })
      : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.url.includes('/api/auth/')
      ) {
        auth.logout();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
